--!strict
--[[
	DecorService — les décorations Blender des mondes (Decorations/ du dépôt),
	posées sur les gradins du canyon de CHAQUE niveau, et derrière les tapis du lobby.

	Les modèles viennent de ServerStorage.BikeASMR.DecorShapes : chaque décoration
	y est décrite pièce par pièce (blocs, cylindres, boules), donc aucun maillage à
	importer ni à publier. Un modèle de chaque est construit une fois, puis cloné.

	OÙ, dans chaque niveau, deux rangées de chaque côté :
	  — dans le FOND du niveau, sur la nappe mortelle, le long des murs du canyon
	    (|x| de 130 à 168), comme les pics et les gemmes déjà posés là. Toujours
	    PLUS BAS que la piste, et seulement là où rien du niveau ne passe au-dessus :
	    jamais dans un pilier ni sous une plateforme ;
	  — sur le REBORD du canyon (dessus d'herbe du premier gradin, |x| > 170),
	    plus grandes, pour la silhouette au loin. Hors de portée d'un saut
	    (voir World.Border).

	QUOI. Chaque niveau reçoit les mondes qui vont avec son thème (LEVEL_WORLDS),
	chaque tapis du lobby le monde de son thème (TREADMILL_WORLD).

	Tout est décor : ancré, sans collision, sans requête ni toucher, sans ombre.
	Construit une fois au démarrage du serveur, après MapService (qui bâtit la map
	dans son Init), dans un dossier à part : Workspace.BikeASMR.DecorMondes.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local MapConfig = require(ReplicatedStorage.BikeASMR.Config.MapConfig)
local LobbyConfig = require(ReplicatedStorage.BikeASMR.Config.LobbyConfig)

local DecorService = {}
DecorService.Priority = 95        -- tout à la fin : le décor ne conditionne rien

-- Mondes de décor par niveau (voir MapConfig.Levels pour les thèmes).
local LEVEL_WORLDS: { [number]: { string } } = {
	[1] = { "Retro", "Robot" },        -- Clavier
	[2] = { "Candy" },                 -- Papier bulle
	[3] = { "Candy", "Lava" },         -- Chocolat (la lave monte)
	[4] = { "Robot" },                 -- Écraseurs
	[5] = { "Candy", "Retro" },        -- Pop it
	[6] = { "Ice", "Candy" },          -- Mer de squishies
	[7] = { "Lava", "Dragon" },        -- Lave rose
	[8] = { "Dragon" },                -- Beurre (l'or du dragon)
	[9] = { "Ice" },                   -- Rivière gelée
	[10] = { "Skeleton", "Ghost" },    -- Pont d'os
	[11] = { "Robot", "Ghost" },       -- Galaxie
	[12] = { "Retro", "Robot" },       -- Dernier clic
}

-- Monde de décor derrière chaque tapis du lobby (LobbyConfig.Treadmills).
local TREADMILL_WORLD: { [string]: string } = {
	BonbonGeant = "Candy", Glace = "Ice", Lave = "Lava", Robot = "Robot",
	Squelette = "Skeleton", Retro8bit = "Retro", Dragon = "Dragon", Fantome = "Ghost",
}

local INNER = 170                         -- face intérieure du canyon (World.Border)
local RIM = { from = INNER + 6, to = INNER + 78, scale = NumberRange.new(5, 6.5) }
local RIM_SPACING = NumberRange.new(170, 240)
local PIT_X = NumberRange.new(130, 168)   -- bande du fond, le long des murs
local PIT_SCALE = NumberRange.new(4.2, 6.5)
local PIT_MAX_TOP = 40                    -- hauteur max d'un décor du fond (studs)
local PIT_SPACING = NumberRange.new(55, 85)
local FLOOR_Y = -30                       -- surface de la nappe mortelle (World.LevelKit)

type Template = { model: Model, radius: number, height: number }

local templates: { [string]: { Template } } = {}

--========================= CONSTRUCTION DES MODÈLES =========================--

local function makePart(shape: number, color: Color3, glow: boolean, cf: CFrame, size: Vector3): BasePart
	local p = Instance.new("Part")
	if shape == 2 then
		p.Shape = Enum.PartType.Cylinder
	elseif shape == 3 then
		p.Shape = Enum.PartType.Ball
	end
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = if glow then Enum.Material.Neon else Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	if shape == 4 then
		local m = Instance.new("SpecialMesh")
		m.MeshType = Enum.MeshType.Sphere
		m.Parent = p
	end
	return p
end

local function buildTemplates()
	local data = require(ServerStorage.BikeASMR.DecorShapes) :: any
	for world, def in data do
		local colors = {}
		for i, c in def.Colors do
			colors[i] = { Color3.fromHex(c[1]), c[2] }
		end
		local list = {}
		for _, prop in def.Props do
			local m = Instance.new("Model")
			m.Name = prop.Name
			local q = prop.Parts
			local radius = 0
			for i = 1, #q, 14 do
				local pos = Vector3.new(q[i + 2], q[i + 3], q[i + 4])
				local right = Vector3.new(q[i + 5], q[i + 6], q[i + 7])
				local up = Vector3.new(q[i + 8], q[i + 9], q[i + 10])
				local size = Vector3.new(q[i + 11], q[i + 12], q[i + 13])
				local col = colors[q[i + 1]]
				local p = makePart(q[i], col[1], col[2], CFrame.fromMatrix(pos, right, up), size)
				p.Parent = m
				radius = math.max(radius, Vector2.new(pos.X, pos.Z).Magnitude + size.Magnitude / 2)
			end
			m.WorldPivot = CFrame.new()
			table.insert(list, { model = m, radius = radius, height = prop.Height })
		end
		templates[world] = list
	end
end

--========================= POSE =========================--

local rimRay = RaycastParams.new()
rimRay.FilterType = Enum.RaycastFilterType.Include
local pitRay = RaycastParams.new()
pitRay.FilterType = Enum.RaycastFilterType.Include

-- Dessus du gradin sous (x, z), ou nil si le rayon ne trouve pas une surface plate.
local function rimAt(x: number, z: number, fromY: number): Vector3?
	local hit = Workspace:Raycast(Vector3.new(x, fromY, z), Vector3.new(0, -1200, 0), rimRay)
	if hit and hit.Normal.Y > 0.9 then
		return hit.Position
	end
	return nil
end

--[[
	Point du fond libre sous (x, z) pour un décor de rayon r. La nappe elle-même
	ignore les rayons (CanQuery = false, World.LevelKit) : un point est LIBRE quand
	un rayon lancé d'en haut jusqu'à la nappe ne touche AUCUNE pièce du niveau
	(piliers, plateformes, pièges), au centre et sur huit points autour.
]]
local AROUND = { Vector2.zero }
for k = 0, 7 do
	local a = k * math.pi / 4
	table.insert(AROUND, Vector2.new(math.cos(a), math.sin(a)))
end

local function pitAt(x: number, z: number, r: number, rideY: number): Vector3?
	local floor = rideY + FLOOR_Y
	local top = rideY + 400
	for _, o in AROUND do
		if Workspace:Raycast(Vector3.new(x + o.X * r, top, z + o.Y * r), Vector3.new(0, floor - top - 1, 0), pitRay) then
			return nil
		end
	end
	return Vector3.new(x, floor, z)
end

local function place(parent: Instance, t: Template, at: Vector3, scale: number, yaw: number, rng: Random)
	local m = t.model:Clone()
	m:ScaleTo(scale)
	m:PivotTo(CFrame.new(at) * CFrame.Angles(0, yaw, 0))
	-- Les fantômes flottent : DecorController anime tout ce qui porte DecorBob.
	if m.Name == "FriendlyGhost" then
		local phase = rng:NextNumber(0, 5)
		for _, d in m:GetDescendants() do
			if d:IsA("BasePart") then
				d:SetAttribute("DecorBob", 1.2 * scale)
				d:SetAttribute("DecorBobT", 4)
				d:SetAttribute("DecorBobP", phase)
			end
		end
	end
	m.Parent = parent
end

local function pick(worlds: { string }, rng: Random): Template?
	local list = templates[worlds[rng:NextInteger(1, #worlds)]]
	return if list and #list > 0 then list[rng:NextInteger(1, #list)] else nil
end

-- Rangée du fond, d'un côté (side = -1 ou 1), entre z0 et z1.
local function fillPit(parent: Instance, worlds: { string }, side: number, z0: number, z1: number, rideY: number, rng: Random): number
	local count = 0
	local z = z0 + rng:NextNumber(0, 30)
	while z < z1 do
		local t = pick(worlds, rng)
		if t then
			local scale = rng:NextNumber(PIT_SCALE.Min, PIT_SCALE.Max)
			scale = math.min(scale, PIT_MAX_TOP / math.max(t.height, 0.5), (PIT_X.Max - PIT_X.Min) / 2 / math.max(t.radius, 0.5))
			local r = t.radius * scale
			local x = side * rng:NextNumber(PIT_X.Min + r, PIT_X.Max - r)
			local at = pitAt(x, z, r, rideY)
			if at then
				place(parent, t, at, scale, rng:NextNumber(0, math.pi * 2), rng)
				count += 1
			end
		end
		z += rng:NextNumber(PIT_SPACING.Min, PIT_SPACING.Max)
	end
	return count
end

-- Rangée du rebord, d'un côté.
local function fillRim(parent: Instance, worlds: { string }, side: number, z0: number, z1: number, fromY: number, rng: Random): number
	local count = 0
	local z = z0 + rng:NextNumber(20, 90)
	while z < z1 do
		local t = pick(worlds, rng)
		if t then
			local half = (RIM.to - RIM.from) / 2
			local scale = math.min(rng:NextNumber(RIM.scale.Min, RIM.scale.Max), (half - 3) / math.max(t.radius, 0.5))
			local x = side * ((RIM.from + RIM.to) / 2 + rng:NextNumber(-1, 1) * math.max(0, half - 3 - t.radius * scale))
			local at = rimAt(x, z, fromY)
			if at then
				place(parent, t, at, scale, rng:NextNumber(0, math.pi * 2), rng)
				count += 1
			end
		end
		z += rng:NextNumber(RIM_SPACING.Min, RIM_SPACING.Max)
	end
	return count
end

function DecorService:Start()
	local root = Workspace:WaitForChild("BikeASMR")
	local map = root:WaitForChild("Map")
	local canyon = map:WaitForChild("Canyon", 30)
	if not canyon then
		warn("[DecorService] canyon introuvable : décors non posés")
		return
	end
	rimRay.FilterDescendantsInstances = { canyon }
	local levels = map:FindFirstChild("Levels")

	local old = root:FindFirstChild("DecorMondes")
	if old then
		old:Destroy()
	end
	buildTemplates()

	local folder = Instance.new("Folder")
	folder.Name = "DecorMondes"
	local total = 0

	-- Niveaux : fond et rebord, des deux côtés, tout le long du parcours.
	for i, worlds in LEVEL_WORLDS do
		if not MapConfig.Levels[i] then
			continue
		end
		local f = Instance.new("Folder")
		f.Name = "Level" .. i
		f.Parent = folder
		local rng = Random.new(4242 + i * 31)
		local z0 = MapConfig.LevelStartZ(i)
		local z1 = z0 + MapConfig.CarpetLength
		local rideY = MapConfig.LevelY(i)
		local levelFolder = levels and levels:FindFirstChild("Level" .. i)
		for _, side in { -1, 1 } do
			if levelFolder then
				pitRay.FilterDescendantsInstances = { levelFolder }
				total += fillPit(f, worlds, side, z0 + 120, z1 - 20, rideY, rng)
			end
			total += fillRim(f, worlds, side, z0, z1, rideY + 800, rng)
		end
	end

	-- Lobby : trois décors du thème de chaque tapis, sur le gradin juste derrière lui.
	local lobby = Instance.new("Folder")
	lobby.Name = "Lobby"
	lobby.Parent = folder
	local rng = Random.new(777)
	for k, def in LobbyConfig.Treadmills do
		local world = TREADMILL_WORLD[def.Id]
		local list = world and templates[world]
		if not list then
			continue
		end
		local z = -240 + (k - 1) * 52        -- même rangée que World.Lobby
		for j = -1, 1 do
			local t = list[rng:NextInteger(1, #list)]
			local scale = math.min(rng:NextNumber(3.5, 4.5), ((RIM.to - RIM.from) / 2 - 3) / math.max(t.radius, 0.5), 16 / math.max(t.radius, 0.5))
			local hit = rimAt(-(RIM.from + RIM.to) / 2 + j * 18, z + j * 16, 800)
			if hit then
				place(lobby, t, hit, scale, rng:NextNumber(0, math.pi * 2), rng)
				total += 1
			end
		end
	end

	folder.Parent = root
	print(("[DecorService] %d décorations posées"):format(total))
end

return DecorService
