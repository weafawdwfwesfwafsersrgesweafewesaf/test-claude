-- AuraClient (LocalScript) -> à mettre dans StarterPlayer > StarterPlayerScripts
-- Anime les auras : spirales qui tournent, intensité qui monte avec la vitesse,
-- traînées au-dessus d'une certaine vitesse, explosion d'étincelles quand on accélère fort.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage:WaitForChild("AuraConfig"))
local camera = workspace.CurrentCamera

type AuraState = {
	folder: Folder,
	root: BasePart,
	seat: Seat | VehicleSeat | nil,
	volume: BasePart,
	emitters: { ParticleEmitter },
	trails: { Trail },
	spinners: { { weld: Weld, lift: number, dir: number } },
	light: PointLight?,
	angle: number,
	boosted: boolean,
	visible: boolean?,
}

local auras: { [Folder]: AuraState } = {}

local function register(folder: Instance)
	if not folder:IsA("Folder") then
		return
	end
	local model = folder.Parent
	local volume = folder:WaitForChild("AuraVolume", 10) :: BasePart?
	if not model or not volume then
		return
	end
	local weld = volume:FindFirstChild("AuraWeld") :: Weld
	local state: AuraState = {
		folder = folder,
		root = weld.Part0 :: BasePart,
		seat = model:FindFirstChildWhichIsA("VehicleSeat", true) or model:FindFirstChildWhichIsA("Seat", true),
		volume = volume,
		emitters = {},
		trails = {},
		spinners = {},
		light = volume:FindFirstChild("AuraLight") :: PointLight?,
		angle = math.random() * math.pi * 2,
		boosted = false,
	}
	for _, child in volume:GetChildren() do
		if child:IsA("ParticleEmitter") then
			table.insert(state.emitters, child)
		elseif child:IsA("Trail") then
			table.insert(state.trails, child)
		end
	end
	for name, dir in { AuraHelix = 1, AuraRing = -0.6 } do
		local part = folder:FindFirstChild(name)
		if part then
			table.insert(state.spinners, {
				weld = part:FindFirstChild("AuraWeld") :: Weld,
				lift = part:GetAttribute("Lift") or 0,
				dir = dir,
			})
		end
	end
	auras[folder] = state
end

local function setVisible(state: AuraState, visible: boolean)
	if state.visible == visible then
		return
	end
	state.visible = visible
	for _, e in state.emitters do
		e.Enabled = visible
	end
	if not visible then
		for _, t in state.trails do
			t.Enabled = false
		end
	end
	if state.light then
		state.light.Enabled = visible
	end
	for _, s in state.spinners do
		(s.weld.Part1 :: BasePart).LocalTransparencyModifier = if visible then 0 else 1
	end
end

for _, folder in CollectionService:GetTagged("BikeAura") do
	task.spawn(register, folder)
end
CollectionService:GetInstanceAddedSignal("BikeAura"):Connect(register)
CollectionService:GetInstanceRemovedSignal("BikeAura"):Connect(function(folder)
	auras[folder] = nil
end)

local clock = 0
RunService.RenderStepped:Connect(function(dt)
	clock += dt
	local camPos = camera.CFrame.Position
	for folder, state in auras do
		if not folder.Parent or not state.root.Parent then
			auras[folder] = nil
			continue
		end
		local riding = not Config.OnlyWhenRiding or (state.seat ~= nil and state.seat.Occupant ~= nil)
		local near = (state.root.Position - camPos).Magnitude < Config.MaxDistance
		setVisible(state, riding and near)
		if not state.visible then
			continue
		end

		local speed = state.root.AssemblyLinearVelocity.Magnitude
		local k = math.clamp(speed / Config.FullSpeed, 0, 1)

		-- plus on va vite, plus l'aura s'emballe
		for _, e in state.emitters do
			local baseRate = e:GetAttribute("BaseRate") or e.Rate
			e.Rate = baseRate * (0.5 + 1.8 * k)
			e.TimeScale = 0.9 + 0.5 * k
		end
		for _, t in state.trails do
			t.Enabled = speed > Config.TrailMinSpeed
		end
		if state.light then
			state.light.Brightness = 1.5 + 2.5 * k + 0.4 * math.sin(clock * 6)
		end

		-- rotation des spirales et de l'anneau, avec une petite "respiration"
		state.angle += dt * Config.SpinSpeed * (1 + 2 * k)
		local base = folder:GetAttribute("BaseC0") :: CFrame
		local pulse = 1 + 0.04 * math.sin(clock * 4)
		for _, s in state.spinners do
			s.weld.C0 = base * CFrame.new(0, s.lift * pulse, 0) * CFrame.Angles(0, state.angle * s.dir, 0)
		end

		-- explosion d'étincelles + tourbillon quand on passe la vitesse "boost"
		if speed > Config.BoostSpeed and not state.boosted then
			state.boosted = true
			for _, e in state.emitters do
				if e.Name == "Sparks" then
					e:Emit(30)
				elseif e.Name == "GroundSwirl" then
					e:Emit(2)
				end
			end
		elseif speed < Config.BoostSpeed * 0.7 then
			state.boosted = false
		end
	end
end)
