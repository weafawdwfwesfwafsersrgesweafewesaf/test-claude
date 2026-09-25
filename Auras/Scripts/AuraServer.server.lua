-- AuraServer (Script) -> à mettre dans ServerScriptService
-- Construit l'aura sur chaque vélo. L'animation (rotation, intensité selon la vitesse)
-- est faite côté joueur par AuraClient.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("AuraConfig"))
local Assets = ReplicatedStorage:FindFirstChild("AuraAssets") -- MeshParts AuraHelix / AuraRing importées

local T = Config.Textures

local function seq(...)
	local points = {}
	for _, p in { ... } do
		table.insert(points, NumberSequenceKeypoint.new(p[1], p[2]))
	end
	return NumberSequence.new(points)
end

local function themeOf(model: Model)
	local name = model:GetAttribute("AuraTheme") or Config.ThemeByBikeName[model.Name] or Config.DefaultTheme
	return Config.Themes[name] or Config.Themes[Config.DefaultTheme]
end

local function looksLikeBike(model: Instance): boolean
	if not model:IsA("Model") then
		return false
	end
	if CollectionService:HasTag(model, Config.BikeTag) then
		return true
	end
	local lower = string.lower(model.Name)
	for _, pattern in Config.BikeNamePatterns do
		if string.find(lower, pattern, 1, true) then
			return true
		end
	end
	return false
end

local function isBike(model: Instance): boolean
	if not looksLikeBike(model) then
		return false
	end
	-- un sous-modèle d'un vélo (ex. "BikeFrame" dans "Bike") n'a pas sa propre aura
	local parent = model.Parent
	while parent and parent ~= workspace do
		if looksLikeBike(parent) then
			return false
		end
		parent = parent.Parent
	end
	return true
end

local function rootOf(model: Model): BasePart?
	return model.PrimaryPart
		or model:FindFirstChildWhichIsA("VehicleSeat", true)
		or model:FindFirstChildWhichIsA("Seat", true)
		or model:FindFirstChildWhichIsA("BasePart", true)
end

local function makeWeldedPart(root: BasePart, name: string, offset: CFrame, parent: Instance, template: BasePart?)
	local part = (template and template:Clone()) or Instance.new("Part")
	part.Name = name
	part.Anchored = false
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.CastShadow = false
	part.CFrame = root.CFrame * offset
	part.Parent = parent
	local weld = Instance.new("Weld")
	weld.Name = "AuraWeld"
	weld.Part0 = root
	weld.Part1 = part
	weld.C0 = offset
	weld.Parent = part
	return part
end

local function flipbookEmitter(name: string, texture: string, theme)
	local e = Instance.new("ParticleEmitter")
	e.Name = name
	e.Texture = texture
	e.FlipbookLayout = Enum.ParticleFlipbookLayout.Grid8x8
	e.FlipbookMode = Enum.ParticleFlipbookMode.OneShot
	e.LightEmission = 1
	e.Color = ColorSequence.new(theme.C1, theme.C2)
	e.Orientation = Enum.ParticleOrientation.FacingCamera
	return e
end

local function buildAura(model: Model)
	if model:FindFirstChild("Aura") then
		return
	end
	local root = rootOf(model)
	if not root then
		return
	end
	local theme = themeOf(model)
	local s = Config.AuraScale

	-- point au sol, au centre du vélo, orienté comme le vélo
	local boxCf, boxSize = model:GetBoundingBox()
	local bottom = root.CFrame:PointToObjectSpace(boxCf.Position - Vector3.new(0, boxSize.Y / 2, 0))
	local base = CFrame.new(bottom) * CFrame.Angles(0, math.rad(Config.YawOffsetDegrees), 0)

	local folder = Instance.new("Folder")
	folder.Name = "Aura"
	folder:SetAttribute("BaseC0", base)

	-- Volume invisible qui sert de forme d'émission (anneau autour du vélo)
	local volume = makeWeldedPart(root, "AuraVolume", base * CFrame.new(0, 0.3 * s, 0), folder)
	volume.Transparency = 1
	volume.Size = Vector3.new(4.2, 0.2, 6.4) * s

	-- Flammes fluides tout autour
	local flames = flipbookEmitter("Flames", T.Flame, theme)
	flames.Shape = Enum.ParticleEmitterShape.Cylinder
	flames.ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface
	flames.Rate = 22
	flames.Lifetime = NumberRange.new(0.7, 1.1)
	flames.Size = seq({ 0, 1.6 * s }, { 1, 2.6 * s })
	flames.Transparency = seq({ 0, 0.1 }, { 1, 0.4 })
	flames.Speed = NumberRange.new(0.5, 1.5)
	flames.Acceleration = Vector3.new(0, 3, 0)
	flames.Rotation = NumberRange.new(-8, 8)
	flames:SetAttribute("BaseRate", flames.Rate)
	flames.Parent = volume

	-- Fumée qui traîne derrière (non liée au vélo -> elle reste sur place quand on roule)
	local smoke = flipbookEmitter("Smoke", T.Smoke, theme)
	smoke.Color = ColorSequence.new(theme.C2, theme.C2)
	smoke.LightEmission = 0.4
	smoke.Rate = 6
	smoke.Lifetime = NumberRange.new(1, 1.6)
	smoke.Size = seq({ 0, 1.5 * s }, { 1, 4 * s })
	smoke.Transparency = seq({ 0, 0.35 }, { 1, 0.8 })
	smoke.Speed = NumberRange.new(0.3, 1)
	smoke.Acceleration = Vector3.new(0, 1.2, 0)
	smoke.RotSpeed = NumberRange.new(-40, 40)
	smoke:SetAttribute("BaseRate", smoke.Rate)
	smoke.Parent = volume

	-- Étincelles étoilées qui montent
	local sparks = Instance.new("ParticleEmitter")
	sparks.Name = "Sparks"
	sparks.Texture = T.Spark
	sparks.LightEmission = 1
	sparks.Color = ColorSequence.new(theme.C1)
	sparks.Shape = Enum.ParticleEmitterShape.Cylinder
	sparks.Rate = 8
	sparks.Lifetime = NumberRange.new(0.8, 1.6)
	sparks.Size = seq({ 0, 0 }, { 0.2, 0.55 * s }, { 1, 0 })
	sparks.Speed = NumberRange.new(2, 5)
	sparks.SpreadAngle = Vector2.new(35, 35)
	sparks.Acceleration = Vector3.new(0, 2, 0)
	sparks.Drag = 1.5
	sparks.RotSpeed = NumberRange.new(-180, 180)
	sparks:SetAttribute("BaseRate", sparks.Rate)
	sparks.Parent = volume

	-- Tourbillon au sol (particule à plat)
	local swirl = flipbookEmitter("GroundSwirl", T.Swirl, theme)
	swirl.Orientation = Enum.ParticleOrientation.VelocityPerpendicular
	swirl.EmissionDirection = Enum.NormalId.Top
	swirl.Speed = NumberRange.new(0.01)
	swirl.Rate = 2.5
	swirl.Lifetime = NumberRange.new(1.2)
	swirl.Size = seq({ 0, 6 * s }, { 1, 8 * s })
	swirl.Transparency = seq({ 0, 0.2 }, { 1, 0.6 })
	swirl.LockedToPart = true
	swirl:SetAttribute("BaseRate", swirl.Rate)
	swirl.Parent = volume

	-- Lueur colorée sur le sol et le vélo
	local light = Instance.new("PointLight")
	light.Name = "AuraLight"
	light.Color = theme.C2
	light.Brightness = 2
	light.Range = 12 * s
	light.Shadows = false
	light.Parent = volume

	-- Traînées d'énergie derrière le vélo
	local back = boxSize.Z / 2
	for i, side in { -0.6, 0.6 } do
		local a0 = Instance.new("Attachment")
		a0.Name = "TrailLow" .. i
		a0.Position = Vector3.new(side * s, 0.2 * s, back * 0.8)
		a0.Parent = volume
		local a1 = Instance.new("Attachment")
		a1.Name = "TrailHigh" .. i
		a1.Position = Vector3.new(side * s, 2.4 * s, back * 0.8)
		a1.Parent = volume
		local trail = Instance.new("Trail")
		trail.Name = "Trail" .. i
		trail.Attachment0 = a0
		trail.Attachment1 = a1
		trail.Texture = T.Streak
		trail.TextureMode = Enum.TextureMode.Stretch
		trail.LightEmission = 1
		trail.FaceCamera = true
		trail.Lifetime = 0.35
		trail.Color = ColorSequence.new(theme.C1, theme.C2)
		trail.Transparency = seq({ 0, 0.15 }, { 1, 1 })
		trail.WidthScale = seq({ 0, 1 }, { 1, 0.2 })
		trail.Enabled = false
		trail.Parent = volume
	end

	-- Spirales + anneau en mesh (importés depuis Blender), matériau ForceField = effet fluide animé
	if Assets then
		for _, name in { "AuraHelix", "AuraRing" } do
			local template = Assets:FindFirstChild(name)
			if template and template:IsA("BasePart") then
				local part = makeWeldedPart(root, name, base, folder, template)
				part.Size = template.Size * s
				part.Material = Enum.Material.ForceField
				part.Color = theme.C2
				part.Transparency = 0
				if part:IsA("MeshPart") then
					part.TextureID = T.Streak
				end
				-- le mesh est posé au sol : on remonte son centre de la moitié de sa hauteur
				local weld = part:FindFirstChild("AuraWeld") :: Weld
				local lift = if name == "AuraRing" then 0.1 * s else part.Size.Y / 2
				weld.C0 = base * CFrame.new(0, lift, 0)
				part:SetAttribute("Lift", lift)
			end
		end
	end

	folder.Parent = model
	CollectionService:AddTag(folder, "BikeAura")
end

local function consider(inst: Instance)
	if isBike(inst) then
		task.defer(buildAura, inst :: Model)
	end
end

for _, inst in workspace:GetDescendants() do
	consider(inst)
end
workspace.DescendantAdded:Connect(consider)
CollectionService:GetInstanceAddedSignal(Config.BikeTag):Connect(consider)
