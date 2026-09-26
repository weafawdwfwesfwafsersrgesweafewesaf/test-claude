--!strict
--[[
	HazardController — anime les pièges mobiles des niveaux.

	Les pièges sont des Parts ancrées posées par MapBuilder et marquées d'attributs.
	On les déplace ici, image par image, en calculant leur position à partir de
	Workspace:GetServerTimeNow().

	Pourquoi côté client et pas serveur : une Part déplacée par le serveur arrive
	par réplication, donc saccadée et en retard, alors que la collision du vélo est
	simulée en local. En recalculant la position depuis une horloge PARTAGÉE, le
	mouvement est parfaitement fluide, identique chez tous les joueurs, et ne coûte
	pas un octet de réseau.

	La contrepartie — assumée — est qu'un tricheur pourrait figer les pièges chez
	lui. Rien de ce qu'ils gardent n'est une récompense : le serveur valide déjà le
	débit de touches, c'est là qu'est la vraie sécurité.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local SoundConfig = require(ReplicatedStorage.BikeASMR.Config.SoundConfig)
local BikeController = require(script.Parent.BikeController)

local HazardController = {}
HazardController.Priority = 45

--[[
	Pièges suivis, en ENSEMBLE et non en liste.

	Le streaming fait apparaître et disparaître les pièges au fil des déplacements :
	il faut pouvoir en retirer un sans parcourir tout le tableau.
]]
local hazards: { [BasePart]: boolean } = {}

--[[
	OÙ EST LE VÉLO PAR RAPPORT À UNE PIÈCE.

	On teste dans le repère de la PIÈCE et non en monde : le disque tournant et les
	dalles qui dérivent bougent, et un test en coordonnées monde les manquerait dès
	qu'ils ne sont plus alignés sur les axes.
]]
--[[
	PHASE D'UNE HORLOGE PÉRIODIQUE, entre 0 et 1.

	`GetServerTimeNow` rend un temps UNIX : environ 1,7 MILLIARD. Le passer tel quel
	dans un angle le détruit — à cette magnitude un flottant 32 bits ne distingue
	plus deux images consécutives, et le disque tournant restait parfaitement
	immobile sans qu'aucune erreur ne soit levée.

	Les anciens pièges prenaient le modulo AVANT de s'en servir ; ils marchaient donc,
	et le piège était invisible pour qui recopiait la ligne d'à côté. On donne un nom
	à l'opération pour qu'elle ne puisse plus être oubliée.
]]
local function tour(now: number, period: number, phase: number?): number
	if period <= 1e-4 then
		return 0
	end
	return ((now + (phase or 0)) % period) / period
end

local function dessus(part: BasePart, chassis: BasePart, marge: number?): boolean
	local p = part.CFrame:PointToObjectSpace(chassis.Position)
	local demi = part.Size / 2
	local m = marge or 6
	return math.abs(p.X) < demi.X + m
		and math.abs(p.Z) < demi.Z + m
		-- Au-DESSUS, et pas trop haut : un vélo qui survole à vingt studs n'est pas
		-- posé dessus, et il ne doit ni la casser ni être emporté par elle.
		and p.Y > demi.Y - 2 and p.Y < demi.Y + 14
end

local function dedans(part: BasePart, chassis: BasePart): boolean
	local p = part.CFrame:PointToObjectSpace(chassis.Position)
	local demi = part.Size / 2
	return math.abs(p.X) < demi.X and math.abs(p.Y) < demi.Y and math.abs(p.Z) < demi.Z
end

-- État des dalles de sable : quand on les a touchées, quand elles sont tombées.
type Sable = { touche: number, tombe: number }
local sables: { [BasePart]: Sable } = {}

--[[
	LE DÉCOR D'UN PIÈGE SUIT LA PIÈCE QUI LE PILOTE.

	La pièce pilote reste une boîte ou une sphère simple : c'est elle qui porte les
	attributs, qu'on déplace, et sur laquelle on teste le contact. Une forme
	compliquée rendrait ce test faux ou cher.

	Tout ce qui n'est QUE visuel vit dans un dossier `Decor` accroché dessous. On lit
	son écart à la pièce pilote UNE fois, au premier passage, puis on le repose à
	chaque image. L'écart étant un CFrame complet, le décor suit aussi la ROTATION :
	les éclats d'une boule roulent avec elle.

	L'écart se prend avant que le piège n'ait bougé — d'où l'enregistrement en tête
	de boucle et la pose en fin. Pris après, on mémoriserait un décor déjà décalé, et
	il le resterait pour toujours.
]]
type Piece = { part: BasePart, ecart: CFrame }
local decors: { [BasePart]: { Piece } } = {}

local function enregistrerDecor(pilote: BasePart)
	if decors[pilote] then
		return
	end
	local liste: { Piece } = {}
	local dossier = pilote:FindFirstChild("Decor")
	if dossier then
		for _, d in dossier:GetChildren() do
			if d:IsA("BasePart") then
				table.insert(liste, { part = d, ecart = pilote.CFrame:ToObjectSpace(d.CFrame) })
			end
		end
	end
	decors[pilote] = liste
end

local function suivreDecor(pilote: BasePart)
	local liste = decors[pilote]
	if not liste then
		return
	end
	for _, piece in liste do
		if piece.part.Parent then
			piece.part.CFrame = pilote.CFrame * piece.ecart
		end
	end
end
local hazardCount = 0

-- État des pièges « à contact » : quand on s'est posé dessus (piliers qui s'enfoncent).
type Touche = { t: number, home: number }
local sinks: { [BasePart]: Touche } = {}

--[[
	LAVE QUI MONTE AVEC NOUS : chaque joueur a SA montée, partie à son entrée dans
	le niveau (ou à sa réapparition). Elle est locale comme tout le reste des pièges :
	les autres joueurs voient la leur, pas la nôtre.
]]
local floodStart: { [BasePart]: number } = {}
local lastLaunch = 0
local BASE_GRAVITY = Workspace.Gravity
local gravityMult = 1
local countdownText: { [BasePart]: string } = {}
local conveyorDir: { [BasePart]: number } = {}

--[[
	Lissage en S sur [0, 1]. Une mâchoire qui démarre et s'arrête net donne
	l'impression d'un téléport ; avec l'accélération, on voit qu'elle arrive et on
	peut anticiper — c'est la différence entre un piège et une sanction.
]]
local function ease(a: number): number
	a = math.clamp(a, 0, 1)
	return a * a * (3 - 2 * a)
end

-- Position d'un aller-retour : montée, palier, descente, attente.
local function cycle(phase: number, travel: number, hold: number): number
	if phase < travel then
		return ease(phase / travel)
	elseif phase < travel + hold then
		return 1
	elseif phase < travel * 2 + hold then
		return 1 - ease((phase - travel - hold) / travel)
	end
	return 0
end

local function attr(part: BasePart, name: string, fallback: number): number
	return (part:GetAttribute(name) :: number?) or fallback
end

--========================= LE BOSS AILÉ =========================--

--[[
	Le dragon bat des ailes, et son corps suit la pièce du piège.

	Le modèle n'est PAS soudé à elle, et ce n'est pas un choix : c'est mesuré.
	Le piège est déplacé par le CLIENT alors que les pièces du modèle
	appartiennent au serveur, qui les remet où il veut — le pilote s'éloignait de
	214 studs pendant que le dragon restait planté. On écrit donc les CFrame
	nous-mêmes, exactement comme on écrit celle de la pièce.

	Les écarts sont relevés UNE SEULE FOIS. C'est ce qui permet d'ajouter la
	rotation des ailes par-dessus sans qu'elle s'accumule d'une image à l'autre.
]]
type RigPart = { part: BasePart, offset: CFrame, wing: number }
type Rig = {
	parts: { RigPart }, hinge: number, phase: number, beats: number,
	awake: boolean, wing: Sound, roar: Sound,
}

local rigs: { [Model]: Rig } = {}

local FLAP_RATE = 2.1              -- battements par seconde en chasse
local FLAP_ANGLE = math.rad(34)

local function newSound(id: string, volume: number, speed: number, parent: Instance): Sound
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Volume = volume
	s.PlaybackSpeed = speed
	-- Il doit s'entendre de loin : c'est un boss de 192 studs, pas un détail.
	s.RollOffMinDistance = 90
	s.RollOffMaxDistance = 1200
	s.Parent = parent
	return s
end

--[[
	LE MODÈLE ARRIVE EN PLUSIEURS FOIS, LE GRÉEMENT DOIT S'EN APERCEVOIR.

	Le streaming livre les pièces par paquets. Relevé à la première image, le
	gréement n'en connaissait que 33 sur 42 — et comme il était mis en cache, il
	ne les apprenait jamais. Le dragon restait figé pendant que sa pièce, elle,
	poursuivait le joueur.

	On marque donc le modèle « à refaire » dès qu'une pièce s'y ajoute. Les sons
	et la phase du battement survivent à la reconstruction : refaire le gréement
	ne doit pas couper un coup d'aile en cours.
]]
local dirty: { [Model]: boolean } = {}
local watched: { [Model]: boolean } = {}

local function rigOf(part: BasePart, model: Model): Rig
	if not watched[model] then
		watched[model] = true
		model.DescendantAdded:Connect(function()
			dirty[model] = true
		end)
	end

	local cached = rigs[model]
	if cached and not dirty[model] then
		return cached
	end
	dirty[model] = nil

	local pivot = model:GetPivot()
	local parts: { RigPart } = {}
	local wingY, wingCount = 0, 0
	for _, piece in model:GetDescendants() do
		if piece:IsA("BasePart") then
			-- Les noms viennent du modèle : Aile_G à gauche, Aile_D à droite. Les
			-- deux tournent en sens opposé, sinon il vrille au lieu de battre.
			local wing = 0
			if piece.Name:find("Aile_G") then
				wing = 1
			elseif piece.Name:find("Aile_D") then
				wing = -1
			end
			local offset = pivot:ToObjectSpace(piece.CFrame)
			if wing ~= 0 then
				wingY += offset.Y
				wingCount += 1
			end
			table.insert(parts, { part = piece, offset = offset, wing = wing })
		end
	end

	-- La charnière est à l'épaule et non au centre du dragon : autour du centre,
	-- les ailes se décolleraient du dos à chaque battement.
	local rig: Rig = cached or {
		parts = parts,
		hinge = 0,
		phase = 0,
		beats = 0,
		awake = false,
		wing = newSound(SoundConfig.DragonWing, SoundConfig.Volumes.DragonWing, 0.5, part),
		roar = newSound(SoundConfig.DragonRoar, SoundConfig.Volumes.DragonRoar, 0.32, part),
	}
	rig.parts = parts
	rig.hinge = if wingCount > 0 then wingY / wingCount else 0
	rigs[model] = rig
	return rig
end

local function animateRig(part: BasePart, dt: number, awake: boolean)
	local model = part:FindFirstChildOfClass("Model")
	if not model then
		return
	end
	local rig = rigOf(part, model)

	-- Posé sur son perchoir il plane ; lancé il bat deux fois plus vite. C'est ce
	-- changement de cadence qui s'entend arriver avant qu'on le voie.
	local rate = if awake then FLAP_RATE else FLAP_RATE * 0.45
	rig.phase += rate * dt

	local flap = math.sin(rig.phase * math.pi * 2) * FLAP_ANGLE
	local pivot = part.CFrame
	local up = CFrame.new(0, rig.hinge, 0)
	local down = CFrame.new(0, -rig.hinge, 0)

	for _, entry in rig.parts do
		if entry.wing == 0 then
			entry.part.CFrame = pivot * entry.offset
		else
			entry.part.CFrame = pivot * up * CFrame.Angles(0, 0, entry.wing * flap) * down * entry.offset
		end
	end

	-- Un coup d'aile par cycle, au passage du bas : c'est là que l'air claque.
	local beats = math.floor(rig.phase)
	if beats > rig.beats then
		rig.beats = beats
		if awake then
			rig.wing:Play()
		end
	end

	-- Le rugissement ne sort qu'au décollage, pas en boucle : répété il
	-- deviendrait du bruit de fond et ne dirait plus rien.
	if awake ~= rig.awake then
		rig.awake = awake
		if awake then
			rig.roar:Play()
		end
	end
end

--========================= BOUCLE =========================--

local function update(dt: number)
	local now = Workspace:GetServerTimeNow()
	local chassis = BikeController.GetChassis()
	--[[
		LA POUSSÉE DES TAPIS PASSE PAR LA VITESSE, PAS PAR LA POSITION.

		Déplacer le châssis directement ne marche pas : le vélo roule sous une
		LinearVelocity dont BikeController réécrit la consigne à chaque image. La
		contrainte ramène donc le vélo vers la vitesse demandée et efface le
		déplacement — mesuré : 24 studs de dérive obtenus pour 34 demandés, et dans le
		mauvais sens la moitié du temps.

		On CUMULE donc la poussée ici et on la publie sur le châssis ; BikeController
		l'ajoute à sa consigne. L'attribut plutôt qu'un appel direct parce que c'est
		lui qui nous requiert : l'inverse ferait un cycle.
	]]
	local pousse = 0
	local pousseZ = 0
	local wantedGravity = 1
	local level = BikeController.GetLevel()

	for part in hazards do
		if not part.Parent then
			continue
		end
		local kind = part:GetAttribute("Hazard")
		-- Avant tout déplacement : c'est là, et seulement là, que l'écart est juste.
		enregistrerDecor(part)

		if kind == "RisingLava" then
			local period = attr(part, "Period", 13)
			local t = cycle(now % period, attr(part, "Rise", 2.2), attr(part, "Hold", 2.5))
			local low, high = attr(part, "LowY", 0), attr(part, "HighY", 0)
			local y = low + (high - low) * t
			part.Position = Vector3.new(part.Position.X, y, part.Position.Z)

			-- Touché par la lave : on repart au début du niveau.
			if chassis then
				local surface = y + part.Size.Y / 2
				if chassis.Position.Y < surface
					and math.abs(chassis.Position.Z - part.Position.Z) < part.Size.Z / 2
				then
					BikeController.Respawn()
				end
			end

		elseif kind == "Slide" then
			local period = attr(part, "Period", 10)
			local phase = (now + attr(part, "Phase", 0)) % period
			local t = cycle(phase, attr(part, "Travel", 1.4), attr(part, "Hold", 2.4))
			local open = attr(part, "OpenX", 0)
			--[[
				LA POSITION FERMÉE SE DÉDUIT DE LA TAILLE RÉELLE DE LA MÂCHOIRE.

				`ShutX` était une position absolue, calculée à la construction pour la
				largeur d'alors. Redimensionner une mâchoire dans Studio ne la mettait
				pas à jour : le niveau 4 avait des plaques trois fois moins larges que
				prévu, qui se « fermaient » en laissant 185 studs de passage sur une
				piste large de 78. Elles bougeaient, elles avaient leur collision, et
				elles ne pouvaient toucher personne.

				`Gap` est la demi-ouverture voulue au point de fermeture. En repartant
				de la taille courante, la mâchoire se referme toujours au même endroit,
				quelle que soit sa largeur.
			]]
			local gap = part:GetAttribute("Gap") :: number?
			local shut = if gap
				then math.sign(open) * (gap + part.Size.X / 2)
				else attr(part, "ShutX", 0)
			part.Position = Vector3.new(open + (shut - open) * t,
				attr(part, "FixedY", part.Position.Y), attr(part, "FixedZ", part.Position.Z))

			--[[
				PRIS DANS LA MÂCHOIRE : ON REPART AU DÉBUT.

				Les deux plaques se rejoignent maintenant au MILIEU. Une plaque pleine
				qui balaie le vélo à quatre cents studs par seconde n'a aucune issue
				physique propre : le moteur l'éjecte au hasard, parfois à travers le
				sol. Un renvoi franc vaut mieux qu'un vol plané imprévisible.

				On teste le CENTRE du châssis et non son enveloppe : rouler contre une
				mâchoire déjà fermée doit simplement bloquer, comme un mur. Seul le
				balayage attrape.
			]]
			--[[
				LE CONTACT SUFFIT, DÈS QUE LA MÂCHOIRE SE FERME.

				Attendre que le CENTRE du châssis soit dans la mâchoire ne marchait pas :
				la physique pousse le vélo devant la plaque avant que ça arrive, puis
				l'éjecte quand les deux plaques se rejoignent. Le piège bougeait, il
				touchait, et il ne tuait jamais. On élargit donc la zone de `KillMargin`
				studs (la demi-largeur du vélo), mais seulement quand la mâchoire est
				en train de se fermer ou fermée : ouverte, c'est un mur comme un autre.
			]]
			if chassis and t > 0.25 then
				local inside = part.CFrame:PointToObjectSpace(chassis.Position)
				local half = part.Size / 2
				if math.abs(inside.X) < half.X + attr(part, "KillMargin", 3)
					and math.abs(inside.Y) < half.Y + 1
					and math.abs(inside.Z) < half.Z + 0.5
				then
					BikeController.Respawn()
				end
			end

		elseif kind == "Oncoming" then
			local period = attr(part, "Period", 24)
			local travel = attr(part, "Travel", 7)
			local phase = (now + attr(part, "Phase", 0)) % period
			local from, to = attr(part, "FromZ", 0), attr(part, "ToZ", 0)
			if phase < travel then
				-- Course à vitesse constante : une plaque qui accélère serait illisible.
				part.Transparency = 0
				part.CanCollide = true
				part.Position = Vector3.new(0, attr(part, "FixedY", part.Position.Y),
					from + (to - from) * (phase / travel))
			else
				-- Hors course, on la sort du jeu plutôt que de la laisser au bout du
				-- couloir : sinon elle bloque l'arrivée.
				part.Transparency = 1
				part.CanCollide = false
				part.Position = Vector3.new(0, attr(part, "FixedY", 0) - 500, from)
			end

		elseif kind == "Lift" then
			local period = attr(part, "Period", 9)
			local low, high = attr(part, "LowY", 0), attr(part, "HighY", 0)
			local t = cycle(now % period, period * 0.42, period * 0.08)
			part.Position = Vector3.new(part.Position.X, low + (high - low) * t, part.Position.Z)

		elseif kind == "Blink" then
			local period = attr(part, "Period", 5)
			local on = attr(part, "On", 1)
			local phase = (now + attr(part, "Phase", 0)) % period
			local present = phase < on
			part.CanCollide = present
			-- On annonce l'apparition : un demi-seconde avant, le pilier s'éclaircit.
			-- Un pilier qui surgit sans prévenir ne se joue pas, il se subit.
			local warning = phase > period - 0.5
			part.Transparency = if present then 0 elseif warning then 0.55 else 0.92

		--[[
			DALLE DE SABLE : elle tient, elle tremble, elle tombe.

			Le tremblement n'est pas un ornement : sans lui, une dalle qui disparaît sous
			les roues ne se joue pas, elle se subit. Un demi-tour de préavis suffit à
			transformer la surprise en décision.
		]]
		elseif kind == "Crumble" then
			local etat = sables[part]
			if not etat then
				etat = { touche = 0, tombe = 0 }
				sables[part] = etat
			end
			local home = attr(part, "HomeY", part.Position.Y)
			local delai = attr(part, "Delay", 0.45)

			if etat.tombe > 0 then
				if now - etat.tombe > attr(part, "Back", 4) then
					etat.tombe, etat.touche = 0, 0
					part.CanCollide = true
					part.Transparency = 0
					part.Position = Vector3.new(part.Position.X, home, part.Position.Z)
				end
			elseif etat.touche > 0 then
				if now - etat.touche > delai then
					etat.tombe = now
					part.CanCollide = false
					part.Transparency = 0.75
					-- Sous la piste plutôt que détruite : elle doit revenir, et une pièce
					-- recréée perdrait son étiquette et sortirait de la boucle.
					part.Position = Vector3.new(part.Position.X, home - 300, part.Position.Z)
				else
					local k = (now - etat.touche) / delai
					-- Le frémissement se compte depuis le CONTACT et non depuis l'époque UNIX :
					-- la même perte de précision le figerait.
					part.Position = Vector3.new(
						attr(part, "HomeX", part.Position.X) + math.sin((now - etat.touche) * 55) * k * 2,
						home, part.Position.Z)
				end
			elseif chassis and dessus(part, chassis) then
				etat.touche = now
				part:SetAttribute("HomeX", part.Position.X)
			end

		-- Tapis : il pousse de côté tant qu'on roule dessus. Voir la poussée cumulée
		-- en tête de boucle pour la raison d'être de ce détour.

		elseif kind == "Conveyor" then
			--[[
				COULOIR POUSSANT. Sans période, il pousse toujours pareil (vers le côté :
				Push). Avec période, il alterne : vers l'avant (Forward, flèches vertes)
				puis vers l'arrière (PushZ, flèches rouges).
			]]
			local period = part:GetAttribute("Period") :: number?
			local dir = 1
			if period then
				dir = if tour(now, period, attr(part, "Phase", 0)) < 0.5 then 1 else -1
				if conveyorDir[part] ~= dir then
					conveyorDir[part] = dir
					local arrows = part:FindFirstChild("Fleches")
					if arrows then
						for _, a in arrows:GetChildren() do
							if a:IsA("BasePart") then
								a.Color = if dir > 0 then Color3.fromRGB(80, 255, 120) else Color3.fromRGB(255, 60, 60)
							end
						end
					end
				end
			end
			if chassis then
				local zPush = part:GetAttribute("PushZ") :: number?
				if dessus(part, chassis, if zPush then 0 else 10) then
					pousse += attr(part, "Push", 0)
					if zPush then
						pousseZ += if dir > 0 then attr(part, "Forward", 0) else -zPush
					end
				end
			end

		-- Sol mortel (lave, eau, poison) : on le touche, on repart au début du niveau.
		elseif kind == "KillPlane" then
			if chassis then
				local p = part.CFrame:PointToObjectSpace(chassis.Position)
				local half = part.Size / 2
				if math.abs(p.X) < half.X and math.abs(p.Z) < half.Z and p.Y < half.Y + 1.5 then
					BikeController.Respawn()
				end
			end

		-- Flèches : un coup d'accélérateur tant qu'on roule dessus.
		elseif kind == "BoostPad" then
			if chassis and dessus(part, chassis, 1) then
				BikeController.Boost(attr(part, "Duration", 2))
			end

		-- Tremplin (barre espace) : on est projeté vers le haut, et boosté si demandé.
		elseif kind == "JumpPad" then
			if chassis and dessus(part, chassis, 1) and now - lastLaunch > 0.4 then
				local v = chassis.AssemblyLinearVelocity
				if v.Y < attr(part, "Power", 180) * 0.5 then
					lastLaunch = now
					chassis.AssemblyLinearVelocity = Vector3.new(v.X, attr(part, "Power", 180), v.Z)
					local boost = part:GetAttribute("Boost") :: number?
					if boost then
						BikeController.Boost(boost)
					end
				end
			end

		--[[
			PILIER QUI S'ENFONCE : il tient `Delay` secondes après qu'on s'y est posé,
			puis descend dans la lave, et revient `Back` secondes plus tard. Son corps
			(dossier Decor) le suit.
		]]
		elseif kind == "Sink" then
			local st = sinks[part]
			if not st then
				st = { t = 0, home = part.Position.Y }
				sinks[part] = st
			end
			if st.t == 0 and chassis and dessus(part, chassis, 0) then
				st.t = now
			end
			local y = st.home
			if st.t > 0 then
				local delay, rate, depth = attr(part, "Delay", 0.5), attr(part, "Rate", 10), attr(part, "Depth", 40)
				local e = now - st.t - delay
				if e > 0 then
					y = st.home - math.min(depth, e * rate)
				end
				if now - st.t > delay + depth / rate + attr(part, "Back", 4) then
					st.t = 0
					y = st.home
				end
			end
			part.Position = Vector3.new(part.Position.X, y, part.Position.Z)

		elseif kind == "Flood" then
			local lair = part:GetAttribute("LevelIndex") :: number?
			if level ~= nil and level == lair then
				if not floodStart[part] then
					floodStart[part] = now
				end
			else
				floodStart[part] = nil
			end
			local base = attr(part, "BaseY", part.Position.Y)
			local start = floodStart[part]
			local y = if start then math.min(attr(part, "MaxY", base), base + (now - start) * attr(part, "Rate", 4)) else base
			part.Position = Vector3.new(part.Position.X, y, part.Position.Z)
			if start and chassis then
				local p = part.CFrame:PointToObjectSpace(chassis.Position)
				local half = part.Size / 2
				if math.abs(p.X) < half.X and math.abs(p.Z) < half.Z and p.Y < half.Y + 1 then
					BikeController.Respawn()
				end
			end

		-- Flottement en sinus (squishies).
		elseif kind == "Bob" then
			local y = attr(part, "BaseY", part.Position.Y)
				+ math.sin(tour(now, attr(part, "Period", 4), attr(part, "Phase", 0)) * math.pi * 2) * attr(part, "Amplitude", 4)
			part.Position = Vector3.new(part.Position.X, y, part.Position.Z)

		-- Compte à rebours d'un couloir qui se referme.
		elseif kind == "Countdown" then
			local period, open = attr(part, "Period", 13), attr(part, "OpenFor", 10)
			local ph = (now + attr(part, "Offset", 0)) % period
			local text = if ph < open then tostring(math.ceil(open - ph)) else "CLOSING!"
			if countdownText[part] ~= text then
				countdownText[part] = text
				local label = part:FindFirstChild("Label", true) :: TextLabel?
				if label then
					label.Text = text
					label.TextColor3 = if ph >= open then Color3.fromRGB(255, 70, 70)
						elseif open - ph < 3 then Color3.fromRGB(255, 200, 60)
						else Color3.fromRGB(120, 255, 140)
				end
			end

		-- Zone de gravité (galaxie).
		elseif kind == "Gravity" then
			if chassis and dedans(part, chassis) then
				wantedGravity = attr(part, "Multiplier", 1)
			end

		--[[
			DISQUE TOURNANT : il emporte ce qui est posé dessus.

			Une pièce ANCRÉE tournée par CFrame n'entraîne rien du tout — le moteur ne
			lui connaît aucune vitesse. Sans ce report, on resterait immobile au-dessus
			d'un disque qui tourne sous les roues, ce qui est exactement l'inverse de
			l'effet recherché.

			On reporte la POSITION seulement : l'orientation du vélo appartient à
			l'AlignOrientation de BikeController, la lui disputer ferait vibrer le cap.
		]]
		elseif kind == "Spinner" then
			local avant = part.CFrame
			local angle = tour(now, attr(part, "Period", 9)) * math.pi * 2
			part.CFrame = CFrame.new(part.Position.X, attr(part, "FixedY", part.Position.Y),
				part.Position.Z) * CFrame.Angles(0, angle, 0)
			if chassis and dessus(part, chassis) then
				local ici = chassis.Position
				local suivi = part.CFrame:PointToWorldSpace(avant:PointToObjectSpace(ici))
				chassis.CFrame = chassis.CFrame + (suivi - ici)
			end

		-- Dalle qui dérive : même report, en translation.
		elseif kind == "Drift" then
			local avant = part.Position.X
			local x = attr(part, "HomeX", avant)
				+ math.sin(tour(now, attr(part, "Period", 5.5), attr(part, "Phase", 0)) * math.pi * 2)
				* attr(part, "Amplitude", 80)
			part.Position = Vector3.new(x, attr(part, "FixedY", part.Position.Y), part.Position.Z)
			if chassis and dessus(part, chassis) then
				chassis.CFrame = chassis.CFrame + Vector3.new(x - avant, 0, 0)
			end

		-- Coussin : il ne porte pas, il renvoie. Et seulement vers le BAS — le
		-- traverser en montant ne doit pas relancer une deuxième fois.
		elseif kind == "Bounce" and chassis then
			local v = chassis.AssemblyLinearVelocity
			if v.Y < 0 and dedans(part, chassis) then
				chassis.AssemblyLinearVelocity = Vector3.new(v.X, attr(part, "Power", 150), v.Z)
			end

		-- Pendule : un mur qui va et vient sur l'axe. Son Z ne bouge pas, on doit
		-- pouvoir l'attendre ; c'est ce qui le distingue d'une plaque lancée.
		elseif kind == "Pendulum" then
			local x = math.sin(tour(now, attr(part, "Period", 3), attr(part, "Phase", 0)) * math.pi * 2)
				* attr(part, "Span", 300) / 2
			part.Position = Vector3.new(x, attr(part, "FixedY", part.Position.Y),
				attr(part, "FixedZ", part.Position.Z))
			if chassis and dedans(part, chassis) then
				BikeController.Respawn()
			end

		--[[
			LA VAGUE. Elle balaie le couloir sur un cycle, et elle TUE.

			Hors de sa course elle est rangée sous la piste plutôt que laissée au bout :
			une vague qui attend, visible, au fond du couloir, ne se lit pas comme une
			vague mais comme un mur.

			Elle ne demande pas de précision, elle demande du TEMPS : à la vitesse
			d'entrée il faut la laisser passer et partir juste derrière, deux cents
			points plus tard on passe devant. C'est le même obstacle qui raconte les deux.
		]]
		elseif kind == "Wave" then
			local periode = attr(part, "Period", 14)
			local course = attr(part, "Travel", 5)
			local phase = ((now + attr(part, "Phase", 0)) % periode)
			local de, vers = attr(part, "FromZ", 0), attr(part, "ToZ", 0)
			if phase < course then
				local y = attr(part, "FixedY", part.Position.Y)
				part.Transparency = 0.25
				part.Position = Vector3.new(0, y, de + (vers - de) * (phase / course))
				if chassis and dedans(part, chassis) then
					BikeController.Respawn()
				end
			else
				part.Transparency = 1
				part.Position = Vector3.new(0, attr(part, "FixedY", 0) - 900, de)
			end

		--[[
			LA BOULE. Même horloge que la vague, mais elle ne prend qu'une voie — on peut
			l'éviter EN SE DÉCALANT, là où la vague ne laisse que le temps.

			Elle roule pour de vrai : l'angle se déduit de la distance parcourue divisée
			par le rayon, comme une roue de vélo. Une boule qui glisse sans tourner ne
			se lit pas comme une boule.
		]]
		elseif kind == "Boulder" then
			local periode = attr(part, "Period", 12)
			local course = attr(part, "Travel", 4)
			local phase = ((now + attr(part, "Phase", 0)) % periode)
			local de, vers = attr(part, "FromZ", 0), attr(part, "ToZ", 0)
			local x = attr(part, "FixedX", part.Position.X)
			if phase < course then
				local avance = phase / course
				local z = de + (vers - de) * avance
				local rayon = math.max(part.Size.Y / 2, 1)
				local angle = (vers - de) * avance / rayon
				part.Transparency = 0
				part.CFrame = CFrame.new(x, attr(part, "FixedY", part.Position.Y), z)
					* CFrame.Angles(angle, 0, 0)
				if chassis then
					local ecart = chassis.Position - part.Position
					if ecart.Magnitude < attr(part, "Reach", rayon) then
						BikeController.Respawn()
					end
				end
			else
				part.Transparency = 1
				part.CFrame = CFrame.new(x, attr(part, "FixedY", 0) - 900, de)
			end

		--[[
			LE PILON. Il monte lentement, il tombe vite, il attend en bas, il remonte.

			`cycle` décrit déjà exactement ça pour la lave et les mâchoires — montée,
			maintien, descente — et on le réutilise à l'envers : 1 en bas, 0 en haut. Une
			quatrième horloge maison n'aurait fait qu'un quatrième endroit où se tromper.

			Il ne tue que POSÉ : entre deux, on passe dessous sans rien craindre, et c'est
			ce qui en fait un rythme plutôt qu'un mur.
		]]
		elseif kind == "Stomper" then
			local periode = attr(part, "Period", 3)
			local chute = attr(part, "Down", 0.28)
			local pose = attr(part, "Hold", 0.5)
			local t = cycle((now + attr(part, "Phase", 0)) % periode, chute, pose)
			local haut, bas = attr(part, "HighY", part.Position.Y), attr(part, "LowY", 0)
			local y = haut + (bas - haut) * t
			part.Position = Vector3.new(part.Position.X, y, part.Position.Z)
			-- Posé à 80 % de sa course : tout ce qui est DESSOUS ou dedans est écrasé.
			-- (Tester seulement « dedans » ne marchait pas : la physique chasse le vélo
			-- sous le pilon avant que son centre y entre.)
			if chassis and t > 0.8 then
				local p = part.CFrame:PointToObjectSpace(chassis.Position)
				local half = part.Size / 2
				if math.abs(p.X) < half.X + 1.5 and math.abs(p.Z) < half.Z + 1.5 and p.Y < half.Y
					and p.Y > -half.Y - attr(part, "Crush", 8)
				then
					BikeController.Respawn()
				end
			end

		elseif kind == "Chaser" and chassis then
			local home = Vector3.new(0, attr(part, "BaseY", 0), attr(part, "HomeZ", 0))

			--[[
				IL N'ATTAQUE QUE DANS SON COULOIR.

				Sa cible était la position du vélo, où qu'il soit : il décollait donc
				dès que le joueur était à portée de streaming et venait le cueillir au
				niveau d'avant, avant même qu'il ait pu entrer.

				Hors de son niveau il rentre se poster, face à la piste, et se contente
				de battre des ailes.
			]]
			local lair = part:GetAttribute("LevelIndex") :: number?
			local awake = lair == nil or BikeController.GetLevel() == lair

			if awake then
				local here = part.Position
				local step = attr(part, "Speed", 62) * dt
				local toTarget = Vector3.new(chassis.Position.X - here.X, 0, chassis.Position.Z - here.Z)
				if toTarget.Magnitude > 1 then
					--[[
						LE BOSS REGARDE OÙ IL VA.

						Le piège d'origine était un cube : son orientation ne se voyait
						pas. Le dragon a un museau et une queue — sans ça il poursuivait
						en crabe, de travers, sur 192 studs de long.

						Son modèle regarde -Z, et le LookVector d'un CFrame est lui aussi
						son -Z : viser le joueur suffit, sans recalage.
					]]
					local dir = toTarget.Unit
					local nextPos = here + dir * math.min(step, toTarget.Magnitude)
					part.CFrame = CFrame.lookAt(nextPos, nextPos + dir)
				end
				if toTarget.Magnitude < attr(part, "Reach", 30) then
					BikeController.Respawn()
					part.CFrame = CFrame.lookAt(home, home + Vector3.new(0, 0, -1))
				end
			else
				-- Retour au perchoir, sans se téléporter : on le voit repartir.
				local back = home - part.Position
				if back.Magnitude > 2 then
					local dir = back.Unit
					local nextPos = part.Position + dir * math.min(attr(part, "Speed", 62) * dt, back.Magnitude)
					part.CFrame = CFrame.lookAt(nextPos, nextPos + dir)
				else
					part.CFrame = CFrame.lookAt(home, home + Vector3.new(0, 0, -1))
				end
			end

			animateRig(part, dt, awake)
		end

		--[[
			REBOND : toute pièce qui porte `BouncePower` relance le vélo qui s'y pose
			(les squishies). Quelle que soit sa mécanique par ailleurs.
		]]
		local bounce = part:GetAttribute("BouncePower") :: number?
		if bounce and chassis and dessus(part, chassis, 1) and now - lastLaunch > 0.3 then
			local v = chassis.AssemblyLinearVelocity
			if v.Y < bounce * 0.4 then
				lastLaunch = now
				chassis.AssemblyLinearVelocity = Vector3.new(v.X, bounce, v.Z)
			end
		end

		-- Le piège a fini de bouger : son décor le rejoint.
		suivreDecor(part)
	end

	-- Gravité : on ne touche au Workspace qu'au changement.
	if wantedGravity ~= gravityMult then
		gravityMult = wantedGravity
		Workspace.Gravity = BASE_GRAVITY * wantedGravity
	end

	-- Publiée à CHAQUE image, même à zéro : sans remise à zéro explicite, la dernière
	-- poussée resterait accrochée au vélo bien après qu'il a quitté le tapis.
	if chassis then
		chassis:SetAttribute("PousseeLaterale", pousse)
		chassis:SetAttribute("PousseeZ", pousseZ)
	end
end

--========================= CYCLE DE VIE =========================--

function HazardController:Start()
	local map = Workspace:WaitForChild("BikeASMR"):WaitForChild("Map")

	local function add(instance: Instance)
		if instance:IsA("BasePart") and instance:GetAttribute("Hazard") and not hazards[instance] then
			hazards[instance] = true
			hazardCount += 1
		end
	end

	local function remove(instance: Instance)
		if hazards[instance :: BasePart] then
			hazards[instance :: BasePart] = nil
			hazardCount -= 1
		end
	end

	for _, descendant in map:GetDescendants() do
		add(descendant)
	end

	--[[
		L'INVENTAIRE SE TIENT À JOUR, il n'était fait qu'une fois au démarrage.

		C'est ce qui avait cassé tous les pièges : avec le streaming, le client ne
		charge au départ que ce qui entoure le hub — et le hub n'a aucun piège.
		L'inventaire était donc VIDE, la boucle sortait immédiatement, et plus rien
		ne bougeait : ni la vague rouge, ni la lave, ni les mâchoires, ni le géant.

		On s'abonne aux arrivées et aux départs : les pièges d'un niveau entrent dans
		l'inventaire en même temps qu'ils entrent à l'écran, et en sortent avec lui.
	]]
	map.DescendantAdded:Connect(add)
	map.DescendantRemoving:Connect(remove)

	-- Réapparaître relance la lave qui monte et remet les piliers en place.
	BikeController.Teleported:Connect(function()
		table.clear(floodStart)
		for part, st in sinks do
			st.t = 0
			if part.Parent then
				part.Position = Vector3.new(part.Position.X, st.home, part.Position.Z)
			end
		end
	end)

	-- La map est reconstruite à chaque changement de version : on repart de zéro
	-- plutôt que de garder des références vers des Parts détruites.
	map.AncestryChanged:Connect(function()
		if not map.Parent then
			table.clear(hazards)
			hazardCount = 0
		end
	end)

	RunService.Heartbeat:Connect(function(dt: number)
		if hazardCount == 0 then
			return
		end
		local ok, err = pcall(update, dt)
		if not ok then
			warn("[HazardController] " .. tostring(err))
		end
	end)
end

return HazardController
