--!strict
--[[
	MapConfig — description de la map, refaite d'après les captures de référence.

	Topologie : une vallée en blocs (terre brune, dessus herbe) qui court vers +Z.
	Au début, une zone de départ avec la boutique. Puis N niveaux en terrasses, de
	plus en plus hauts, chacun étant un tapis dense de touches de clavier d'une
	couleur propre, séparés par des bassins (lave, néon, eau).

	Les touches sont l'asset fourni : mesh 3x3 studs, pas de 3,2.
	Toute la géométrie se déduit d'ici, MapBuilder ne fait qu'appliquer.
]]

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

--========================= TOUCHES =========================--

--[[
	TOUCHES À LA TAILLE DU PROTOTYPE : l'asset d'origine × 2.

	Ce commentaire annonçait déjà « agrandies ×2 par rapport à l'asset d'origine
	(3 studs) », mais la constante valait 12 — soit ×4. Elle avait dérivé de sa
	propre intention, et une seule touche finissait plus large que le vélo
	(9,88 studs) : c'est ce qui les faisait paraître énormes.

	À 6 studs, une touche mesure exactement ce que mesure KeycapPrototype
	(6,000 × 2,736 × 6,000) : le maillage n'est plus étiré, il est rendu à sa
	taille naturelle.

	Pourquoi pas les 3 studs de l'asset brut, mesuré : il faudrait 165 000
	MeshParts pour couvrir la même surface, contre 10 300 avant. À 6 studs il en
	faut 41 000 — quatre fois plus, mais sous les 56 000 que ce place a déjà
	portés, et ils streament par région.
]]
local KEY_SIZE = 6
-- Le pas garde le même rapport qu'avant (13/12) : l'interstice entre deux touches
-- reste proportionnel à leur taille, sinon le clavier paraîtrait creux.
local KEY_PITCH = 6.5
--[[
	Hauteur d'une touche, distincte de sa largeur.

	Elles étaient CUBIQUES : 12 × 12 × 12. Un cube aussi haut que large ne lit pas
	comme une touche, il lit comme un bloc posé là. Un vrai capuchon est large et
	PLAT.

	2,736 n'est pas un chiffre rond mais la hauteur RÉELLE du capuchon de la
	toolbox une fois doublée (1,368 × 2). Toute autre valeur écrase ou étire le
	maillage ; celle-ci le laisse tel qu'il a été modélisé.
]]
local KEY_HEIGHT = 2.736
-- Élargi d'après les captures : le tapis y occupe toute la vallée, on ne voit
-- presque pas ses bords. À 14 colonnes il ressemblait à un couloir étroit.
--[[
	La grille couvre tout le niveau, mais elle ne sert plus qu'à la DÉTECTION : les
	touches ne sont posées que sur les plateformes réellement construites (voir
	LevelLayouts), et seulement sur la voie centrale de chacune.

	Dix fois plus grand qu'avant : un niveau fait désormais 520 studs de large et
	1092 de long, soit une dizaine de secondes à pleine vitesse au lieu de deux.
]]
--[[
	LA GRILLE SE COMPTE EN CASES, ET LES NIVEAUX EN DÉCOULENT.

	`CARPET_LENGTH = ROWS * KEY_PITCH` : la longueur d'un niveau n'est pas une
	valeur à elle, elle tombe du nombre de cases. Diviser le pas par deux sans
	toucher à ces deux nombres a donc RACCOURCI TOUTE LA MAP de moitié — mesuré :
	11 142 studs de long avant, 6 501 après, et tous les trous des neuf niveaux
	rétrécis d'autant.

	On double donc les deux en même temps qu'on divise le pas : 80 × 6,5 = 520 et
	168 × 6,5 = 1092, exactement les dimensions d'avant. Deux fois plus de touches
	par rangée, mais un niveau de la même taille et des sauts identiques.
]]
local COLS = 80                        -- largeur de la grille, en cases
local ROWS = 200                       -- longueur de la grille, en cases
local CARPET_WIDTH = COLS * KEY_PITCH  -- 115.2
local CARPET_LENGTH = ROWS * KEY_PITCH -- 115.2

--========================= NIVEAUX =========================--
-- `Recommended` reproduit le «Niveau recommandé» des captures : il grimpe bien
-- plus vite que l'index, ce qui pousse à farmer la vitesse avant d'avancer.

--[[
	Chaque niveau est une ARÈNE, pas un rectangle de plus.

	La plateforme occupe toute la largeur de la vallée et on roule partout dessus.
	Le tapis de touches n'en occupe que le centre : `Inset` dit combien de colonnes
	sont remplacées par du terrain de chaque côté. C'est lui qui donne sa FORME au
	niveau — large au départ, étroit au 5 comme sur la capture du passage entre les
	deux murs bleus.

	La grille de détection, elle, garde ses 18 colonnes partout : une case sans
	touche renvoie simplement nil, il n'y a rien à changer côté jeu.

	`Left` / `Right` : le terrain de chaque bande, un par ambiance des captures.
	  Lava      nappe orange craquelée et anneaux de feu
	  Water     bassin translucide avec des blobs qui flottent
	  Grass     herbe et arbres cubiques
	  Rainbow   couloirs de couleurs parallèles
	  Bubbles   sol violet couvert de grosses bulles
	  Neon      sol rose fluo à paillettes
	  Treadmill tapis roulant gris à chevrons
	  Steps     plateformes bleu-gris en escalier, qu'on monte

	`Gate` : couleur du mur qui ferme le niveau. C'est lui qui fait qu'on passe
	d'un niveau à l'autre au lieu de longer un couloir sans fin.
]]
--[[
	`Lanes` : le tapis est découpé en bandes de couleur DANS LE SENS DE LA MARCHE,
	comme sur les captures — bleu, blanc, doré, orange côte à côte. C'est ce détail
	qui empêche un niveau de ressembler à un aplat moucheté : chaque bande dessine
	un couloir qu'on suit ou qu'on quitte.

	`Left` / `Right` : l'ÎlOT posé dans la lave de chaque côté de la plateforme. La
	plateforme ne fait PAS toute la largeur de la vallée : entre elle et les parois
	on voit le sol de lave, et c'est là que flottent ces îlots.

	  LavaRing  arène de lave à anneaux lumineux, bordée d'un damier rouge et blanc
	  Steps     blocs bleu-gris étagés, coiffés de bulles
	  Water     bassin translucide avec des blobs qui flottent
	  Rainbow   couloirs de couleurs parallèles
	  Grass     îlot d'herbe et d'arbres
	  Neon      dalle rose fluo à paillettes
	  Treadmill tapis roulant gris à chevrons
	  Boards    panneaux d'information sur pilotis
]]
--[[
	`Layout` est la MÉCANIQUE du niveau : quelles cases portent du sol, donc ce que
	le joueur doit faire pour traverser. Tout le reste n'est que peinture.

	Le dimensionnement vient d'une mesure, pas d'une intuition : le saut de base
	monte à 9,26 studs et dure 0,63 s, ce qui franchit 29 studs à la vitesse de
	départ (46 studs/s). Tous les trous sont donc à 19 ou 26 studs — passables dès
	la première partie, sans aucun point de vitesse, et triviaux plus tard : c'est
	ça, la récompense du farm.

	  Full     plein. On apprend à rouler et on voit la vitesse monter.
	  Lanes    trois couloirs séparés par du vide. On choisit le sien à l'entrée.
	  Islands  îles décalées à franchir au saut. Première vraie exigence.
	  Slalom   plein, mais des murs alternent à gauche et à droite. Test de conduite.
	  Bridge   un pont étroit au-dessus du vide. Test de nerf.
	  Jumps    larges trous : il faut le double saut. C'est là que les figures vivent.
	  Pillars  piliers isolés à enchaîner. Maîtrise.
	  Final    tout ensemble.

	Les quatre premières et trois dernières rangées sont toujours pleines : on doit
	pouvoir entrer, viser et se réceptionner sans tomber dès l'arrivée.
]]
--[[
	LES DOUZE NIVEAUX.

	Chacun est un MATÉRIAU ASMR, une MÉCANIQUE et une FORME de tracé. Les trois
	ensemble : deux niveaux ne doivent jamais se ressembler, ni au son, ni à la
	main, ni sur la minimap.

	`Layout` nomme la mécanique ; sa géométrie vit dans LevelLayouts, côté serveur.

	POURQUOI LA DIFFICULTÉ NE PEUT PAS VENIR DES TROUS APRÈS LE 8.

	`SpeedFromStat` est asymptotique : 46 studs/s au départ, 105 au plafond, et on
	en est à 102 dès la stat 1250. La portée d'un double saut passe donc de 103
	studs au niveau 1 à 229 au niveau 8… puis à 236 au niveau 12. Sept studs gagnés
	sur les quatre derniers niveaux.

	Un trou plus large ne veut donc plus rien dire passé le 8. La difficulté tardive
	tient sur trois autres axes, et c'est ce qui donne leur identité aux derniers
	niveaux :

	  — la LARGEUR du tracé : on vise de moins en moins large ;
	  — le TEMPS : le sol apparaît, tombe, ou se referme ;
	  — le MOUVEMENT : on atterrit sur quelque chose qui bouge déjà.

	`SpeedRequired` reste une porte de TEMPS DE JEU, pas de puissance : au-delà de
	2000 elle n'achète plus de vitesse, elle achète le droit d'entrer. C'est
	volontaire — c'est la boucle « +1 » qui doit payer, pas la difficulté.
]]
local function lvl(i: number, name: string, title: string, twist: string, speed: number, rec: number, gate: Color3, keys: { Color3 }, platform: Color3)
	return table.freeze({
		Index = i, Name = name, Title = title, Twist = twist, Materiau = name,
		Recommended = rec, SpeedRequired = speed, Layout = name,
		Gate = gate, Keys = table.freeze(keys), Platform = platform,
	})
end

--[[
	LES DOUZE NIVEAUX — un thème, une mécanique.

	Les thèmes sont ceux des modèles 3D du jeu (vélos, tapis, pets) : on roule dans
	le monde de la lave avant de débloquer le vélo de lave. `Twist` résume ce qui
	rend le niveau jouable autrement qu'en tenant la touche avant — sa géométrie vit
	dans World.LevelsA / LevelsB.

	`Title` est le nom affiché (HUD, téléportation, porte verrouillée).
]]
local Levels = table.freeze({
	lvl(1, "Clavier", "KEYBOARD", "Jump from key to key. The SPACE bar launches you!", 0, 2,
		rgb(96, 165, 250), { rgb(96, 165, 250), rgb(130, 190, 255), rgb(70, 130, 230), rgb(200, 225, 255) }, rgb(70, 90, 140)),
	lvl(2, "PapierBulle", "BUBBLE WRAP", "The towers sink when you land. Keep moving!", 25, 5,
		rgb(160, 110, 240), { rgb(160, 110, 240), rgb(190, 150, 255), rgb(130, 80, 220), rgb(225, 205, 255) }, rgb(80, 60, 130)),
	lvl(3, "Chocolat", "CHOCOLATE", "The lava rises! Climb the tall bars in time.", 70, 12,
		rgb(160, 96, 60), { rgb(160, 96, 60), rgb(196, 130, 86), rgb(120, 70, 40), rgb(230, 190, 150) }, rgb(90, 55, 35)),
	lvl(4, "Ecraseurs", "CRUSHERS", "The crushers close one by one. Get through in time!", 150, 24,
		rgb(90, 200, 110), { rgb(90, 200, 110), rgb(130, 225, 140), rgb(60, 160, 90), rgb(200, 245, 205) }, rgb(60, 90, 70)),
	lvl(5, "PopIt", "POP IT", "The lanes push forward or back. Pick the right one!", 300, 40,
		rgb(255, 90, 110), { rgb(255, 90, 110), rgb(90, 210, 110), rgb(255, 210, 60), rgb(80, 160, 255) }, rgb(120, 50, 70)),
	lvl(6, "Squishy", "SQUISHY SEA", "Bounce on the squishies across the sea!", 520, 60,
		rgb(80, 180, 255), { rgb(80, 180, 255), rgb(130, 210, 255), rgb(50, 140, 230), rgb(210, 240, 255) }, rgb(50, 90, 150)),
	lvl(7, "LaveRose", "PINK LAVA", "The pink lava rises with you. Climb fast!", 820, 85,
		rgb(255, 80, 200), { rgb(255, 80, 200), rgb(255, 140, 225), rgb(210, 50, 170), rgb(255, 210, 240) }, rgb(110, 40, 100)),
	lvl(8, "Beurre", "BUTTER RUN", "Squishy butter and moving stones: jump far!", 1250, 120,
		rgb(255, 150, 50), { rgb(255, 150, 50), rgb(255, 190, 100), rgb(220, 110, 30), rgb(255, 225, 180) }, rgb(80, 60, 50)),
	lvl(9, "Glace", "FROZEN RIVER", "Ice is slippery: you slide in the turns!", 1900, 165,
		rgb(120, 220, 255), { rgb(120, 220, 255), rgb(170, 235, 255), rgb(80, 190, 240), rgb(230, 250, 255) }, rgb(70, 130, 170)),
	lvl(10, "Os", "BONE BRIDGE", "The bones crumble and the skulls roll!", 2800, 215,
		rgb(140, 230, 120), { rgb(140, 230, 120), rgb(190, 245, 170), rgb(100, 190, 90), rgb(230, 255, 225) }, rgb(60, 80, 60)),
	lvl(11, "Galaxie", "GALAXY", "Low gravity: huge jumps between the planets!", 4200, 280,
		rgb(170, 110, 255), { rgb(170, 110, 255), rgb(200, 160, 255), rgb(130, 80, 230), rgb(235, 225, 255) }, rgb(50, 35, 100)),
	lvl(12, "DernierClic", "LAST CLICK", "Giant fingers are typing. Don't get squashed!", 6500, 360,
		rgb(255, 205, 60), { rgb(255, 205, 60), rgb(255, 225, 120), rgb(230, 170, 30), rgb(255, 245, 200) }, rgb(130, 95, 30)),
})

--========================= EXPORT =========================--

local MapConfig = {
	Seed = 20260913,

	KeySize = KEY_SIZE,
	KeyHeight = KEY_HEIGHT,
	KeyPitch = KEY_PITCH,
	Cols = COLS,
	Rows = ROWS,
	CarpetWidth = CARPET_WIDTH,
	CarpetLength = CARPET_LENGTH,

	--[[
		Les niveaux sont RELIÉS par une rampe, ils ne sont plus séparés par un vide.

		Avant, 34 studs de vide et 7 studs de marche : en roulant tout droit on
		tombait dedans et on percutait le flanc de la plateforme suivante. Sur les
		captures, chaque niveau se prolonge par une pente orange — on ne s'arrête
		jamais, c'est tout l'intérêt d'un jeu de vitesse.

		46 de pas et 12 de débord laissent 22 studs de pente pour 7 de montée, soit
		17 degrés : franchissable à pleine vitesse sans décoller.
	]]
	--[[
		Tout est à la même échelle que les niveaux : 180 studs de rampe entre deux
		arènes, et 45 studs de dénivelé à chaque fois. À sept studs de marche, la
		progression verticale ne se voyait tout simplement pas.
	]]
	LevelGap = 0,
	LevelRise = 50,       -- chaque niveau est bien plus haut que le précédent
	FirstLevelZ = 300,
	--[[
		Largeur de la voie centrale qui porte les touches, en cases.

		Le reste de chaque plateforme est une dalle nue. À douze colonnes, la map
		demandait 7 306 MeshParts — le rendu de Studio lâche vers 4 500, on l'a
		déjà constaté (écran noir). À cinq, il en reste environ 3 000, et la voie
		fait encore 65 studs de large pour un vélo qui en fait 6.
	]]
	--[[
		Largeur de la voie de touches, en colonnes.

		Elle valait 5, soit 65 studs de large sur des plateformes qui en font 150 :
		les touches formaient un ruban au milieu d'une dalle nue. 0 = pas de limite,
		chaque plateforme est couverte d'un bord à l'autre.
	]]
	KeyLaneCols = 0,

	--[[
		UNE LETTRE COÛTE TROIS INSTANCES ET UNE PASSE DE RENDU.

		Chaque touche portait un SurfaceGui > Frame > TextLabel pour afficher UNE
		lettre. Mesuré sur la map construite : 44 897 touches pour 181 111 instances.
		Les TROIS QUARTS de la map ne sont donc pas la map — ce sont ces étiquettes.
		Elles se répliquent, elles streament, et chacune de celles qui sont à portée
		est rendue dans sa propre texture : 1 089 surfaces dessinées en même temps,
		mesurées depuis le hub.

		Une lettre sur quatre suffit à lire « clavier ». On ne la relit pas en roulant
		à cent studs par seconde, et un vrai clavier vu de loin n'est pas non plus un
		alphabet lisible. Les trois autres touches gardent leur relief et leur
		couleur, et perdent trois instances chacune.

		0 les enlève toutes, 1 les remet toutes.
	]]
	--[[
		INTERRUPTEUR DE DIAGNOSTIC : poser les touches, ou pas.

		À false, la map se construit ENTIÈREMENT sans les capuchons de clavier : même
		terrain, mêmes plateformes, mêmes pièges, mais quarante mille MeshParts en
		moins. Le jeu reste jouable — le gain de vitesse en roulant ne vient pas des
		touches mais de la distance parcourue (Score.RideStudsPerPoint) — seuls le clic
		et le « +1 » par touche disparaissent.

		C'est fait pour RÉPONDRE À UNE QUESTION, pas pour rester à false : si la map
		charge aussi mal sans les touches, ce ne sont pas elles le problème, et on
		cherchera ailleurs. Remettre à true et reconstruire suffit à revenir en arrière.
	]]
	KeysEnabled = false,

	KeyLabelEvery = 4,
	--[[
		Portée de rendu d'une lettre.

		Elle était à 140 studs, soit vingt-trois touches de distance : la lettre y fait
		deux pixels, et on en dessinait mille à la fois. À 55 elle reste lisible quand
		on s'arrête dessus, et il n'en reste qu'une cinquantaine à l'écran.
	]]
	KeyLabelDistance = 55,
	-- Fin du sol du hub. La rampe du niveau 1 part d'ici : les deux valeurs
	-- doivent s'accorder, elles vivent donc au même endroit.
	--[[
		Emprise du hub.

		Il faisait 620 studs de large sur 460 de long : une esplanade vide qu'on
		traversait pendant dix secondes avant d'atteindre la première rampe. Un hub
		sert à se repérer et à partir, pas à marcher.

		340 × 300 : la boutique, le panneau et l'arche y tiennent tous, et le départ
		se voit d'un bout à l'autre.

		Doit rester d'accord avec MapBuilder.BuildStart : c'est aussi l'origine des
		rangées de touches du hub (niveau d'index 0).
	]]
	HubWidth = 340,
	HubFromZ = -300,
	HubEndZ = 300,
	PlatformThickness = 8,
	--[[
		Débord de la plateforme autour du tapis.

		Elle ne fait volontairement PAS toute la largeur de la vallée : sur les
		captures on voit le sol de lave de part et d'autre, et ce sont des îlots
		séparés qui y flottent. En l'élargissant à toute la vallée, j'avais fait
		disparaître la lave du champ de vision.
	]]
	PlatformMargin = 0,

	-- Le sol de lave se tient juste sous les plateformes : il doit remplir l'image,
	-- pas traîner quinze studs plus bas où on ne le voit plus.
	LavaDrop = 13,

	Levels = Levels,

	Valley = table.freeze({
		--[[
			Un canyon serré, pas une plaine.

			Des terrasses de 64 studs de large qui reculaient de 30 à chaque marche
			s'étalaient jusqu'à 246 studs du centre : à l'écran, deux plateaux bruns
			sans fin de part et d'autre de la piste. À 34 de large et 16 de recul, les
			parois restent près et hautes, comme en référence.
		]]
		-- Élargie : il faut de la place pour la lave ET pour les îlots qui y flottent
		-- de chaque côté de la plateforme.
		HalfWidth = 340,
		-- Le vide sous les plateformes : c'est lui qui donne le vertige. On ne
		-- retombe pas d'un trottoir, on tombe vraiment.
		FloorY = -260,
		Dirt = rgb(165, 108, 72),
		DirtDark = rgb(138, 88, 58),
		Grass = rgb(104, 196, 84),
		StepWidth = 120,
		StepBack = 60,
		StepHeight = 90,
		Steps = 4,
		TreeTrunk = rgb(104, 72, 48),
		TreeLeaves = rgb(88, 178, 72),
	}),

	Start = table.freeze({
		SpawnPosition = Vector3.new(0, 6, -240),
		Floor = rgb(96, 104, 128),
		Accent = rgb(255, 205, 90),
		ShopPosition = Vector3.new(-64, 2, 84),
		BoardPosition = Vector3.new(58, 2, 92),
		--[[
			Bornes d'amélioration alignées le long du hub, comme les «+N/Pas» des
			captures : elles donnent au départ sa raison d'être. Chacune affiche son
			gain et le nombre de victoires exigé.
		]]
		Upgrades = table.freeze({
			table.freeze({ Gain = "+3/Pas", Needs = "Gratuit" }),
			table.freeze({ Gain = "+6/Pas", Needs = "3 victoires" }),
			table.freeze({ Gain = "+10/Pas", Needs = "8 victoires" }),
			table.freeze({ Gain = "+25/Pas", Needs = "25 victoires" }),
			table.freeze({ Gain = "+50/Pas", Needs = "60 victoires" }),
			table.freeze({ Gain = "+100/Pas", Needs = "150 victoires" }),
			table.freeze({ Gain = "+500/Pas", Needs = "400 victoires" }),
			table.freeze({ Gain = "+2.5K/Pas", Needs = "1K victoires" }),
		}),
	}),

	--[[
		Ambiance de la vallée.

		Les réglages qui ne changent jamais (correction colorimétrique, bloom, rayons
		de soleil, début du brouillard) vivent dans le Lighting du place, pas ici :
		ce sont des propriétés, elles se règlent à l'œil et se sauvegardent avec le
		fichier. Ne restent ici que celles qu'un thème pourrait vouloir changer.
	]]
	Ambience = table.freeze({
		Fog = rgb(186, 214, 240),
		-- La map fait près de 12 000 studs : à 1 500 de portée, le niveau où l'on
		-- roule était déjà blanchi de moitié et les plateformes disparaissaient.
		FogEnd = 7000,
		-- Ombres moins bouchées : l'ancien gris-bleu éteignait le bleu des touches.
		Ambient = rgb(152, 164, 188),
		ClockTime = 14,
		Brightness = 3.05,
	}),
}

--========================= HELPERS =========================--

function MapConfig.LevelCenterZ(index: number): number
	return MapConfig.FirstLevelZ
		+ (index - 1) * (CARPET_LENGTH + MapConfig.LevelGap)
		+ CARPET_LENGTH / 2
end

-- De combien un niveau se termine plus haut qu'il n'a commencé.
function MapConfig.LevelExitRise(index: number): number
	local level = Levels[index]
	return if level then (level.ExitRise or 0) else 0
end

--[[
	Hauteur de la surface roulante à l'entrée d'un niveau.

	On cumule les montées internes des niveaux précédents : le niveau 7 se termine
	156 studs plus haut qu'il n'a commencé, et le 8 doit repartir de là. Sans ce
	cumul, sa rampe d'accès plongerait de 156 studs d'un coup.
]]
function MapConfig.LevelY(index: number): number
	-- Le hub est au niveau zéro : la formule des couloirs lui donnerait -45.
	if index <= 0 then
		return 0
	end
	local y = (index - 1) * MapConfig.LevelRise
	for i = 1, index - 1 do
		y += MapConfig.LevelExitRise(i)
	end
	return y
end

function MapConfig.KeyX(col: number): number
	return (col - (COLS + 1) / 2) * KEY_PITCH
end

--[[
	Bord d'entrée d'un niveau, origine de ses rangées de touches.

	L'index 0 est le HUB : il a son propre bord, et sa propre longueur. Lui donner
	un index de niveau plutôt qu'un cas particulier permet à ses touches d'être
	détectées par exactement le même chemin que celles des couloirs.
]]
function MapConfig.LevelStartZ(index: number): number
	if index == 0 then
		return MapConfig.HubFromZ
	end
	return MapConfig.LevelCenterZ(index) - CARPET_LENGTH / 2
end

function MapConfig.KeyZ(index: number, row: number): number
	return MapConfig.LevelStartZ(index) + (row - 0.5) * KEY_PITCH
end

-- Dans quel niveau se trouve ce Z ? 0 dans le hub, nil dans un bassin.
function MapConfig.LevelAtZ(z: number): number?
	if z >= MapConfig.HubFromZ and z <= MapConfig.HubEndZ then
		return 0
	end
	for index = 1, #Levels do
		local center = MapConfig.LevelCenterZ(index)
		local half = CARPET_LENGTH / 2 + MapConfig.PlatformMargin
		if z >= center - half and z < center + half then
			return index
		end
	end
	return nil
end

-- (rangée, colonne) sous une position monde. Inverse exact de KeyX / KeyZ.
function MapConfig.CellAt(index: number, position: Vector3): (number, number)
	local col = math.round(position.X / KEY_PITCH + (COLS + 1) / 2)
	local zStart = MapConfig.LevelStartZ(index)
	local row = math.round((position.Z - zStart) / KEY_PITCH + 0.5)
	return row, col
end

function MapConfig.InBounds(row: number, col: number): boolean
	return row >= 1 and row <= ROWS and col >= 1 and col <= COLS
end

function MapConfig.LevelSpawn(index: number): Vector3
	-- Tomber depuis le hub renvoie au hub, pas sur un bord de couloir calculé à
	-- partir d'un index qui n'en est pas un.
	if index <= 0 then
		return MapConfig.Start.SpawnPosition
	end
	return Vector3.new(0, MapConfig.LevelY(index) + 12,
		MapConfig.LevelStartZ(index) + 55)
end

function MapConfig.TotalLength(): number
	return MapConfig.LevelCenterZ(#Levels) + CARPET_LENGTH / 2 + 140
end

return MapConfig
