--!strict
--[[
	AurasController — l'aura « chakra » autour du pilote de CHAQUE vélo.

	Une aura simple, qui colle au corps et qui vit :
	  — des flammes douces qui montent le long du pilote et restent accrochées à lui
	    (LockedToPart) : elles l'enveloppent au lieu de traîner derrière le vélo ;
	  — un voile lumineux, plus large et très transparent, qui respire ;
	  — un contour (Highlight) de la couleur du thème, qui pulse au même rythme ;
	  — quelques étincelles qui s'échappent, et une lumière qui teinte le vélo.
	Plus on roule vite, plus elle s'intensifie.

	Textures intégrées à Roblox (rbxasset://textures/particles/…) : rien à importer.

	Comme avant, le serveur publie le thème sur le vélo (attribut « AuraTheme »,
	BikeService), donc on voit aussi l'aura des autres ; Appliquer() change celle du
	pilote local tout de suite (inventaire). Tout est local : rien n'est répliqué.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local AuraKit = require(ReplicatedStorage.BikeASMR.Modules.AuraKit)

local AurasController = {}
AurasController.Priority = 76

local player = Players.LocalPlayer
local bikesFolder = Workspace:WaitForChild("BikeASMR"):WaitForChild("Bikes")

local DISTANCE_MAX = 250          -- au-delà, l'aura d'un autre joueur est éteinte
local CONTOURS_MAX = 12           -- Roblox limite les Highlight : les plus proches seulement
local VITESSE_MAX = 90            -- studs/s où l'aura est à fond

local FLAMME = "rbxasset://textures/particles/fire_main.dds"
local VOILE = "rbxasset://textures/particles/smoke_main.dds"
local ETINCELLE = "rbxasset://textures/particles/sparkles_main.dds"

type Aura = {
	bike: Model,
	theme: string,
	corps: BasePart,             -- partie du pilote (ou châssis) à laquelle l'aura est accrochée
	volume: Part,                -- volume invisible soudé : la forme d'émission
	flammes: ParticleEmitter,
	voile: ParticleEmitter,
	etincelles: ParticleEmitter,
	lumiere: PointLight,
	contour: Highlight,
	phase: number,
}

local auras: { [Model]: Aura } = {}
local themeLocal: string? = nil

local function seq(points: { { number } }): NumberSequence
	local k = {}
	for _, p in points do
		table.insert(k, NumberSequenceKeypoint.new(p[1], p[2]))
	end
	return NumberSequence.new(k)
end

local function couleurs(nom: string): (Color3, Color3, Color3)
	local t = AuraKit.Theme(nom)
	return Color3.fromHex(t.anneau), Color3.fromHex(t.spirale), Color3.fromHex(t.lueur)
end

local function themeDe(bike: Model): string
	if bike.Name == player.Name and themeLocal then
		return themeLocal
	end
	return (bike:GetAttribute("AuraTheme") :: string?) or AuraKit.THEME_DEFAUT
end

-- Le pilote du vélo (le vélo porte le nom de son joueur) ; à défaut, le châssis.
local function corpsDe(bike: Model): BasePart?
	local pl = Players:FindFirstChild(bike.Name) :: Player?
	local ch = pl and pl.Character
	local hrp = ch and ch:FindFirstChild("HumanoidRootPart")
	if hrp and hrp:IsA("BasePart") then
		return hrp
	end
	local c = bike:FindFirstChild("Chassis")
	return if c and c:IsA("BasePart") then c else nil
end

local function teindre(a: Aura)
	local bord, coeur, lueur = couleurs(a.theme)
	a.flammes.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, coeur),
		ColorSequenceKeypoint.new(0.45, bord),
		ColorSequenceKeypoint.new(1, bord),
	})
	a.voile.Color = ColorSequence.new(lueur)
	a.etincelles.Color = ColorSequence.new(coeur)
	a.lumiere.Color = lueur
	a.contour.FillColor = bord
	a.contour.OutlineColor = coeur
end

local function retirer(a: Aura)
	a.volume:Destroy()
	a.contour:Destroy()
end

local function monter(bike: Model)
	local theme = themeDe(bike)
	local corps = corpsDe(bike)
	local a = auras[bike]
	if a and a.corps == corps and a.volume.Parent then
		if a.theme ~= theme then
			a.theme = theme
			teindre(a)
		end
		return
	end
	if a then
		retirer(a)
		auras[bike] = nil
	end
	if not corps then
		return
	end
	local echelle = (bike:GetAttribute("Echelle") :: number?) or 1
	local surPilote = corps.Name == "HumanoidRootPart"

	-- Volume du corps : les flammes naissent sur sa surface et restent collées au pilote.
	local volume = Instance.new("Part")
	volume.Name = "AuraChakra"
	volume.Size = Vector3.new(2.6, 5.2, 2.2) * echelle
	volume.Transparency = 1
	volume.CanCollide, volume.CanQuery, volume.CanTouch = false, false, false
	volume.Massless = true
	volume.CastShadow = false
	volume.CFrame = corps.CFrame * CFrame.new(0, if surPilote then 0 else 2 * echelle, 0)
	local soudure = Instance.new("WeldConstraint")
	soudure.Part0 = corps
	soudure.Part1 = volume
	soudure.Parent = volume

	local flammes = Instance.new("ParticleEmitter")
	flammes.Name = "Flammes"
	flammes.Texture = FLAMME
	flammes.Shape = Enum.ParticleEmitterShape.Box
	flammes.ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface
	flammes.EmissionDirection = Enum.NormalId.Top
	flammes.LockedToPart = true
	flammes.LightEmission = 1
	flammes.LightInfluence = 0
	flammes.Rate = 45
	flammes.Lifetime = NumberRange.new(0.45, 0.8)
	flammes.Speed = NumberRange.new(1.5, 3)
	flammes.Acceleration = Vector3.new(0, 7, 0) * echelle
	flammes.Drag = 2
	flammes.SpreadAngle = Vector2.new(12, 12)
	flammes.Size = seq({ { 0, 1.1 * echelle }, { 0.35, 1.5 * echelle }, { 1, 0.2 * echelle } })
	flammes.Transparency = seq({ { 0, 1 }, { 0.15, 0.45 }, { 0.7, 0.65 }, { 1, 1 } })
	flammes.Rotation = NumberRange.new(-20, 20)
	flammes.RotSpeed = NumberRange.new(-40, 40)
	flammes.Parent = volume

	local voile = Instance.new("ParticleEmitter")
	voile.Name = "Voile"
	voile.Texture = VOILE
	voile.Shape = Enum.ParticleEmitterShape.Box
	voile.LockedToPart = true
	voile.LightEmission = 1
	voile.LightInfluence = 0
	voile.Rate = 7
	voile.Lifetime = NumberRange.new(0.9, 1.3)
	voile.Speed = NumberRange.new(0.2, 0.6)
	voile.Size = seq({ { 0, 3.2 * echelle }, { 1, 4.4 * echelle } })
	voile.Transparency = seq({ { 0, 1 }, { 0.3, 0.86 }, { 1, 1 } })
	voile.RotSpeed = NumberRange.new(-20, 20)
	voile.Parent = volume

	local etincelles = Instance.new("ParticleEmitter")
	etincelles.Name = "Etincelles"
	etincelles.Texture = ETINCELLE
	etincelles.Shape = Enum.ParticleEmitterShape.Box
	etincelles.ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface
	etincelles.LightEmission = 1
	etincelles.LightInfluence = 0
	etincelles.Rate = 5
	etincelles.Lifetime = NumberRange.new(0.6, 1.1)
	etincelles.Speed = NumberRange.new(1, 2.5)
	etincelles.Acceleration = Vector3.new(0, 4, 0)
	etincelles.Size = seq({ { 0, 0.35 * echelle }, { 1, 0 } })
	etincelles.Parent = volume

	local lumiere = Instance.new("PointLight")
	lumiere.Name = "AuraLumiere"
	lumiere.Range = 10 * echelle
	lumiere.Brightness = 1
	lumiere.Shadows = false
	lumiere.Parent = volume

	-- Contour lumineux du pilote : un halo fin, jamais une silhouette pleine.
	local contour = Instance.new("Highlight")
	contour.Name = "AuraContour"
	contour.DepthMode = Enum.HighlightDepthMode.Occluded
	contour.FillTransparency = 0.88
	contour.OutlineTransparency = 0.45
	contour.Adornee = if surPilote then corps.Parent else bike
	contour.Enabled = false

	a = {
		bike = bike, theme = theme, corps = corps, volume = volume,
		flammes = flammes, voile = voile, etincelles = etincelles,
		lumiere = lumiere, contour = contour, phase = math.random() * 6.28,
	}
	auras[bike] = a
	teindre(a)
	contour.Parent = volume
	volume.Parent = corps.Parent        -- soudé au corps : il suit sans calcul
end

local function suivre(bike: Instance)
	if not bike:IsA("Model") then
		return
	end
	task.spawn(function()
		bike:WaitForChild("Chassis", 10)
		if bike.Parent then
			monter(bike)
		end
	end)
	bike:GetAttributeChangedSignal("AuraTheme"):Connect(function()
		if bike.Name == player.Name then
			themeLocal = nil        -- le serveur a tranché : il fait foi
		end
		monter(bike)
	end)
	bike.Destroying:Once(function()
		local a = auras[bike]
		if a then
			retirer(a)
			auras[bike] = nil
		end
	end)
end

-- Change l'aura du pilote local tout de suite (inventaire).
function AurasController.Appliquer(nomTheme: string)
	themeLocal = nomTheme
	local bike = bikesFolder:FindFirstChild(player.Name)
	if bike and bike:IsA("Model") then
		monter(bike)
	end
end

function AurasController:Start()
	bikesFolder.ChildAdded:Connect(suivre)
	for _, b in bikesFolder:GetChildren() do
		suivre(b)
	end

	local proches: { Aura } = {}
	local aRemonter: { Model } = {}
	local verifie = 0
	RunService.RenderStepped:Connect(function(dt)
		local camera = Workspace.CurrentCamera
		local t = os.clock()

		-- Le pilote change de corps à chaque réapparition : on revérifie de temps en temps.
		verifie += dt
		local revoir = verifie > 1
		if revoir then
			verifie = 0
		end

		if revoir then
			table.clear(aRemonter)
			for bike, a in auras do
				if a.corps.Parent == nil or a.corps ~= corpsDe(bike) then
					table.insert(aRemonter, bike)
				end
			end
			for _, bike in aRemonter do
				monter(bike)
			end
		end

		table.clear(proches)
		for _, a in auras do
			local d = (a.corps.Position - camera.CFrame.Position).Magnitude
			local actif = d < DISTANCE_MAX
			a.flammes.Enabled = actif
			a.voile.Enabled = actif
			a.etincelles.Enabled = actif
			a.lumiere.Enabled = actif
			if not actif then
				a.contour.Enabled = false
				continue
			end
			table.insert(proches, a)

			-- Respiration + vitesse : l'aura gonfle quand on accélère.
			local v = math.clamp(a.corps.AssemblyLinearVelocity.Magnitude / VITESSE_MAX, 0, 1)
			local s = 0.5 + 0.5 * math.sin((t + a.phase) * 2.4)
			a.flammes.Rate = 35 + 30 * s + 60 * v
			a.flammes.TimeScale = 0.9 + 0.4 * v
			a.etincelles.Rate = 3 + 10 * v
			a.lumiere.Brightness = 0.8 + 0.7 * s + 0.8 * v
			a.contour.FillTransparency = 0.92 - 0.06 * s - 0.05 * v
			a.contour.OutlineTransparency = 0.55 - 0.2 * s
		end

		-- Contours : seulement les plus proches (limite de Roblox sur les Highlight).
		table.sort(proches, function(x, y)
			return (x.corps.Position - camera.CFrame.Position).Magnitude < (y.corps.Position - camera.CFrame.Position).Magnitude
		end)
		for i, a in proches do
			a.contour.Enabled = i <= CONTOURS_MAX
		end
	end)
end

return AurasController
