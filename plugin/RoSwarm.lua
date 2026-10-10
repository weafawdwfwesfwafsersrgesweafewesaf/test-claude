--!nocheck
-- RoSwarm — plugin Roblox Studio
-- Relie Studio à l'application RoSwarm (http://127.0.0.1:34900) pour que plusieurs agents IA
-- puissent lire et modifier la place ouverte. Gratuit et open source.

local HttpService = game:GetService("HttpService")
local LogService = game:GetService("LogService")
local RunService = game:GetService("RunService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local InsertService = game:GetService("InsertService")
local okSES, ScriptEditorService = pcall(function()
	return game:GetService("ScriptEditorService")
end)
if not okSES then
	ScriptEditorService = nil
end

local VERSION = "0.1.0"
local PORT = tonumber(plugin:GetSetting("RoSwarmPort")) or 34900
local BASE = "http://127.0.0.1:" .. PORT
local SYNC_ATTR = "RoSwarm"

local function post(route, body)
	local okEnc, encoded = pcall(function()
		return HttpService:JSONEncode(body)
	end)
	if not okEnc then
		encoded = HttpService:JSONEncode({ id = body.id, ok = false, error = "Résultat non sérialisable : " .. tostring(encoded) })
	end
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. route,
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = encoded,
		})
	end)
	if not ok then
		return nil, tostring(res)
	end
	if not res.Success then
		return nil, tostring(res.StatusCode) .. " " .. tostring(res.StatusMessage)
	end
	local okDec, data = pcall(function()
		return HttpService:JSONDecode(res.Body)
	end)
	if not okDec then
		return nil, "JSON invalide"
	end
	return data
end

---------------------------------------------------------------------------
-- Sortie (Output) : envoyée à RoSwarm pour que les agents voient les erreurs
---------------------------------------------------------------------------
local logQueue = {}
local LEVELS = {
	[Enum.MessageType.MessageOutput] = "info",
	[Enum.MessageType.MessageInfo] = "info",
	[Enum.MessageType.MessageWarning] = "warning",
	[Enum.MessageType.MessageError] = "error",
}
LogService.MessageOut:Connect(function(message, messageType)
	if #logQueue < 500 then
		table.insert(logQueue, { text = message, level = LEVELS[messageType] or "info" })
	end
end)

local alive = true
plugin.Unloading:Connect(function()
	alive = false
end)

local isPlay = RunService:IsRunning()

task.spawn(function()
	while alive do
		task.wait(1)
		if #logQueue > 0 then
			local batch = logQueue
			logQueue = {}
			post("/plugin/log", { messages = batch, play = isPlay })
		end
	end
end)

-- Pendant un test (Play), le plugin ne fait que transmettre la sortie.
if isPlay then
	return
end

---------------------------------------------------------------------------
-- Chemins d'instances
---------------------------------------------------------------------------
local VISIBLE_SERVICES = {
	"Workspace", "Players", "Lighting", "MaterialService", "ReplicatedFirst", "ReplicatedStorage",
	"ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Teams",
	"SoundService", "TextChatService",
}
local SYNC_ROOTS = {
	"ServerScriptService", "ReplicatedStorage", "ReplicatedFirst", "ServerStorage", "StarterGui",
	"StarterPack", "StarterPlayer", "Workspace",
}

local function toParts(p)
	if type(p) == "table" then
		return p
	end
	local parts = {}
	for seg in string.gmatch(tostring(p or ""), "[^/]+") do
		table.insert(parts, seg)
	end
	return parts
end

local function childOf(inst, name)
	if inst == game then
		local c = game:FindFirstChild(name)
		if c then
			return c
		end
		local ok, svc = pcall(function()
			return game:GetService(name)
		end)
		if ok then
			return svc
		end
		return nil
	end
	return inst:FindFirstChild(name)
end

local function resolve(p)
	local parts = toParts(p)
	local inst = game
	for i, name in ipairs(parts) do
		local c = childOf(inst, name)
		if not c then
			error("Introuvable : " .. table.concat(parts, "/", 1, i), 0)
		end
		inst = c
	end
	return inst
end

local function pathOf(inst)
	local parts = {}
	while inst and inst ~= game do
		table.insert(parts, 1, inst.Name)
		inst = inst.Parent
	end
	return table.concat(parts, "/")
end

local function pathArray(inst)
	local parts = {}
	while inst and inst ~= game do
		table.insert(parts, 1, inst.Name)
		inst = inst.Parent
	end
	return parts
end

local function rootsOf(root)
	if root ~= game then
		return { root }
	end
	local list = {}
	for _, name in ipairs(VISIBLE_SERVICES) do
		local s = game:FindFirstChild(name)
		if s then
			table.insert(list, s)
		end
	end
	return list
end

---------------------------------------------------------------------------
-- Valeurs <-> JSON
---------------------------------------------------------------------------
local function round(n)
	return math.floor(n * 1000 + 0.5) / 1000
end

local function encodeValue(v)
	local t = typeof(v)
	if t == "string" or t == "number" or t == "boolean" then
		return v
	elseif t == "Instance" then
		return "@" .. pathOf(v)
	elseif t == "Vector3" then
		return { round(v.X), round(v.Y), round(v.Z) }
	elseif t == "Vector2" then
		return { round(v.X), round(v.Y) }
	elseif t == "Color3" then
		return string.format("#%02x%02x%02x", math.floor(v.R * 255 + 0.5), math.floor(v.G * 255 + 0.5), math.floor(v.B * 255 + 0.5))
	elseif t == "CFrame" then
		local rx, ry, rz = v:ToOrientation()
		return { position = encodeValue(v.Position), orientation = { round(math.deg(rx)), round(math.deg(ry)), round(math.deg(rz)) } }
	elseif t == "UDim2" then
		return { v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset }
	elseif t == "UDim" then
		return { v.Scale, v.Offset }
	elseif t == "EnumItem" then
		return tostring(v)
	elseif t == "BrickColor" then
		return v.Name
	elseif v == nil then
		return nil
	end
	return t .. "(" .. tostring(v) .. ")"
end

local function nums(v)
	if type(v) == "table" then
		if v.x or v.X then
			return { v.x or v.X, v.y or v.Y, v.z or v.Z }
		end
		return v
	end
	local list = {}
	for n in string.gmatch(tostring(v), "-?[%d%.]+") do
		table.insert(list, tonumber(n))
	end
	return list
end

local function toColor3(v)
	if type(v) == "string" then
		local hex = v:match("^#?(%x%x%x%x%x%x)$")
		if hex then
			return Color3.fromHex(hex)
		end
		local okB, bc = pcall(function()
			return BrickColor.new(v)
		end)
		if okB then
			return bc.Color
		end
	end
	local n = nums(v)
	if n[1] and (n[1] > 1 or (n[2] or 0) > 1 or (n[3] or 0) > 1) then
		return Color3.fromRGB(n[1], n[2] or 0, n[3] or 0)
	end
	return Color3.new(n[1] or 0, n[2] or 0, n[3] or 0)
end

-- Convertit une valeur JSON vers le type attendu par la propriété.
local function decodeValue(current, v, propName)
	local t = typeof(current)
	if type(v) == "string" and v:sub(1, 1) == "@" then
		return resolve(v:sub(2))
	end
	if t == "Vector3" then
		local n = nums(v)
		return Vector3.new(n[1] or 0, n[2] or 0, n[3] or 0)
	elseif t == "Vector2" then
		local n = nums(v)
		return Vector2.new(n[1] or 0, n[2] or 0)
	elseif t == "Color3" then
		return toColor3(v)
	elseif t == "BrickColor" then
		if type(v) == "string" then
			return BrickColor.new(v)
		end
		return BrickColor.new(toColor3(v))
	elseif t == "UDim2" then
		local n = nums(v)
		return UDim2.new(n[1] or 0, n[2] or 0, n[3] or 0, n[4] or 0)
	elseif t == "UDim" then
		local n = nums(v)
		return UDim.new(n[1] or 0, n[2] or 0)
	elseif t == "CFrame" then
		if type(v) == "table" and v.position then
			local p = nums(v.position)
			local o = nums(v.orientation or { 0, 0, 0 })
			return CFrame.new(p[1], p[2], p[3]) * CFrame.fromOrientation(math.rad(o[1] or 0), math.rad(o[2] or 0), math.rad(o[3] or 0))
		end
		local n = nums(v)
		if #n >= 12 then
			return CFrame.new(unpack(n, 1, 12))
		end
		return CFrame.new(n[1] or 0, n[2] or 0, n[3] or 0)
	elseif t == "EnumItem" then
		local name = tostring(v):match("([%w_]+)$")
		return current.EnumType[name]
	elseif t == "NumberRange" then
		local n = nums(v)
		return NumberRange.new(n[1] or 0, n[2] or n[1] or 0)
	elseif t == "Instance" or (current == nil and type(v) == "string" and propName ~= "Name" and propName ~= "Text") then
		local okR, inst = pcall(resolve, v)
		if okR then
			return inst
		end
	end
	return v
end

local function applyProperties(inst, props)
	local errors = {}
	for name, value in pairs(props or {}) do
		local ok, err = pcall(function()
			local okGet, current = pcall(function()
				return inst[name]
			end)
			if not okGet then
				error("propriété inconnue", 0)
			end
			inst[name] = decodeValue(current, value, name)
		end)
		if not ok then
			table.insert(errors, name .. " : " .. tostring(err))
		end
	end
	return errors
end

local COMMON_PROPS = {
	"Archivable", "Position", "Size", "Orientation", "Color", "Material", "Transparency", "Reflectance",
	"Anchored", "CanCollide", "CanTouch", "CanQuery", "CastShadow", "Shape", "Locked", "Massless",
	"PrimaryPart", "WorldPivot", "Text", "TextColor3", "TextSize", "TextScaled", "Font", "FontFace",
	"BackgroundColor3", "BackgroundTransparency", "AnchorPoint", "Visible", "ZIndex", "LayoutOrder",
	"Image", "ImageColor3", "Enabled", "ResetOnSpawn", "Value", "Disabled", "RunContext", "Brightness",
	"Range", "Health", "MaxHealth", "WalkSpeed", "JumpPower", "JumpHeight", "SoundId", "Volume", "Looped",
	"Playing", "MeshId", "TextureID", "Texture", "Face", "ClockTime", "Ambient", "OutdoorAmbient",
	"FogEnd", "FogColor", "Duration", "Neutral", "TeamColor", "AutoAssignable", "MaxActivationDistance",
	"ActionText", "ObjectText", "HoldDuration", "Adornee", "CameraOffset", "DisplayDistanceType",
}

---------------------------------------------------------------------------
-- Scripts
---------------------------------------------------------------------------
local SCRIPT_CLASSES = { Script = true, LocalScript = true, ModuleScript = true }

local function setSource(scr, source)
	if ScriptEditorService then
		local ok = pcall(function()
			ScriptEditorService:UpdateSourceAsync(scr, function()
				return source
			end)
		end)
		if ok then
			return
		end
	end
	scr.Source = source
end

-- Studio -> fichiers : quand un script synchronisé est modifié dans Studio
local watched = setmetatable({}, { __mode = "k" })
local changedQueue = {}
local suppress = setmetatable({}, { __mode = "k" })

local function watchScript(scr)
	if watched[scr] then
		return
	end
	watched[scr] = scr:GetPropertyChangedSignal("Source"):Connect(function()
		if suppress[scr] then
			return
		end
		changedQueue[scr] = true
	end)
end

task.spawn(function()
	while alive do
		task.wait(1.5)
		local items = {}
		for scr in pairs(changedQueue) do
			if scr.Parent and scr:GetAttribute(SYNC_ATTR) then
				table.insert(items, { path = pathArray(scr), className = scr.ClassName, source = scr.Source })
			end
		end
		changedQueue = {}
		if #items > 0 then
			post("/plugin/changes", { items = items })
		end
	end
end)

local function upsertScript(parts, className, source)
	if not SCRIPT_CLASSES[className] then
		className = "ModuleScript"
	end
	local parent = game
	for i = 1, #parts - 1 do
		local name = parts[i]
		local c = childOf(parent, name)
		if not c then
			if parent == game then
				error("Service inconnu : " .. name, 0)
			end
			c = Instance.new("Folder")
			c.Name = name
			c.Parent = parent
		end
		parent = c
	end
	local name = parts[#parts]
	local existing = parent:FindFirstChild(name)
	local scr
	if existing and existing.ClassName == className then
		scr = existing
	else
		scr = Instance.new(className)
		scr.Name = name
		if existing and existing:IsA("LuaSourceContainer") then
			for _, child in ipairs(existing:GetChildren()) do
				child.Parent = scr
			end
			existing:Destroy()
		end
	end
	suppress[scr] = true
	setSource(scr, source)
	scr:SetAttribute(SYNC_ATTR, true)
	if scr.Parent ~= parent then
		scr.Parent = parent
	end
	task.defer(function()
		suppress[scr] = nil
	end)
	watchScript(scr)
	return scr
end

---------------------------------------------------------------------------
-- Outils
---------------------------------------------------------------------------
local TOOLS = {}

local function recorded(name, fn)
	local id = ChangeHistoryService:TryBeginRecording("RoSwarm : " .. name)
	local results = table.pack(pcall(fn))
	if id then
		ChangeHistoryService:FinishRecording(
			id,
			results[1] and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel
		)
	end
	if not results[1] then
		error(results[2], 0)
	end
	return unpack(results, 2, results.n)
end

TOOLS.ping = function()
	return { version = VERSION, place = game.Name }
end

TOOLS.get_tree = function(a)
	local root = (a.path and #toParts(a.path) > 0) and resolve(a.path) or game
	local depth = math.clamp(tonumber(a.depth) or 2, 0, 10)
	local max = math.clamp(tonumber(a.max) or 400, 1, 3000)
	local count = 0
	local lines = {}
	local function walk(inst, d, indent)
		if count >= max then
			return
		end
		count += 1
		local kids = inst:GetChildren()
		local extra = ""
		if #kids > 0 and d >= depth then
			extra = "  (+" .. #kids .. " enfants)"
		end
		table.insert(lines, indent .. inst.Name .. " [" .. inst.ClassName .. "]" .. extra)
		if d < depth then
			for _, c in ipairs(kids) do
				walk(c, d + 1, indent .. "  ")
			end
		end
	end
	if root == game then
		for _, s in ipairs(rootsOf(game)) do
			walk(s, 1, "")
		end
	else
		walk(root, 0, "")
	end
	local text = table.concat(lines, "\n")
	if count >= max then
		text ..= "\n… (liste coupée à " .. max .. " instances : demande un chemin plus précis)"
	end
	return text
end

TOOLS.list_children = function(a)
	local root = (a.path and #toParts(a.path) > 0) and resolve(a.path) or game
	local kids = root == game and rootsOf(game) or root:GetChildren()
	local out = {}
	for i, c in ipairs(kids) do
		if i > 500 then
			break
		end
		table.insert(out, {
			name = c.Name,
			className = c.ClassName,
			childCount = #c:GetChildren(),
			path = pathOf(c),
			isScript = c:IsA("LuaSourceContainer"),
		})
	end
	return out
end

TOOLS.get_instance = function(a)
	local inst = resolve(a.path)
	local props = {}
	for _, name in ipairs(COMMON_PROPS) do
		local ok, v = pcall(function()
			return inst[name]
		end)
		if ok and v ~= nil then
			props[name] = encodeValue(v)
		end
	end
	local attrs = {}
	for k, v in pairs(inst:GetAttributes()) do
		attrs[k] = encodeValue(v)
	end
	local children = {}
	for i, c in ipairs(inst:GetChildren()) do
		if i > 200 then
			table.insert(children, "…")
			break
		end
		table.insert(children, c.Name .. " [" .. c.ClassName .. "]")
	end
	local tags = {}
	pcall(function()
		tags = inst:GetTags()
	end)
	local result = {
		path = pathOf(inst),
		className = inst.ClassName,
		name = inst.Name,
		properties = props,
		attributes = attrs,
		tags = tags,
		children = children,
	}
	if inst:IsA("LuaSourceContainer") then
		local ok, src = pcall(function()
			return inst.Source
		end)
		result.source = ok and src or nil
	end
	return result
end

TOOLS.search = function(a)
	local q = string.lower(tostring(a.query or ""))
	if q == "" then
		error("query vide", 0)
	end
	local root = (a.root and #toParts(a.root) > 0) and resolve(a.root) or game
	local results = {}
	for _, r in ipairs(rootsOf(root)) do
		for _, d in ipairs(r:GetDescendants()) do
			local hit = nil
			if string.find(string.lower(d.Name), q, 1, true) then
				hit = "nom"
			elseif a.in_source ~= false and d:IsA("LuaSourceContainer") then
				local ok, src = pcall(function()
					return d.Source
				end)
				if ok and string.find(string.lower(src), q, 1, true) then
					hit = "code"
				end
			end
			if hit and a.class then
				local okC, isA = pcall(function()
					return d:IsA(a.class)
				end)
				if not (okC and isA) then
					hit = nil
				end
			end
			if hit then
				table.insert(results, { path = pathOf(d), className = d.ClassName, match = hit })
				if #results >= 100 then
					return { results = results, truncated = true }
				end
			end
		end
	end
	return { results = results, truncated = false }
end

TOOLS.run_luau = function(a)
	local fn, err = loadstring(a.code)
	if not fn then
		error("Erreur de syntaxe : " .. tostring(err), 0)
	end
	local output = {}
	local function capture(prefix)
		return function(...)
			local parts = {}
			for i = 1, select("#", ...) do
				parts[i] = tostring((select(i, ...)))
			end
			table.insert(output, prefix .. table.concat(parts, " "))
		end
	end
	local env = setmetatable({
		print = capture(""),
		warn = capture("AVERTISSEMENT : "),
		plugin = plugin,
	}, { __index = getfenv(1) })
	setfenv(fn, env)
	local packed = table.pack(recorded("run_luau", function()
		return fn()
	end))
	local returns = {}
	for i = 1, packed.n do
		local v = packed[i]
		returns[i] = typeof(v) == "Instance" and ("@" .. pathOf(v)) or tostring(v)
	end
	local text = table.concat(output, "\n")
	if #text > 20000 then
		text = text:sub(1, 20000) .. "\n… (sortie coupée)"
	end
	return { output = text, returns = returns }
end

TOOLS.create_instance = function(a)
	local parent = resolve(a.parent)
	return recorded("create_instance", function()
		local inst = Instance.new(a.class)
		if a.name then
			inst.Name = a.name
		end
		local errors = applyProperties(inst, a.properties)
		inst.Parent = parent
		return { path = pathOf(inst), errors = errors }
	end)
end

TOOLS.set_properties = function(a)
	local inst = resolve(a.path)
	return recorded("set_properties", function()
		local errors = applyProperties(inst, a.properties)
		return { path = pathOf(inst), errors = errors }
	end)
end

TOOLS.delete_instance = function(a)
	local inst = resolve(a.path)
	local p = pathOf(inst)
	recorded("delete_instance", function()
		inst:Destroy()
	end)
	return "Supprimé : " .. p
end

TOOLS.set_script_source = function(a)
	local parts = toParts(a.path)
	local className = a.className
	if not className then
		local okE, existing = pcall(resolve, parts)
		className = (okE and existing.ClassName) or "Script"
	end
	local scr = recorded("set_script_source", function()
		return upsertScript(parts, className, a.source or "")
	end)
	return "Script écrit : " .. pathOf(scr) .. " [" .. scr.ClassName .. "]"
end

TOOLS.asset_insert = function(a)
	local id = tonumber(a.asset_id)
	if not id then
		error("asset_id invalide", 0)
	end
	local parent = resolve(a.parent or "Workspace")
	return recorded("asset_insert", function()
		local objects = {}
		local ok, model = pcall(function()
			return InsertService:LoadAsset(id)
		end)
		if ok and model then
			for _, c in ipairs(model:GetChildren()) do
				table.insert(objects, c)
			end
		else
			objects = game:GetObjects("rbxassetid://" .. id)
		end
		local paths = {}
		for _, obj in ipairs(objects) do
			obj.Parent = parent
			if a.position and (obj:IsA("Model") or obj:IsA("BasePart")) then
				local p = nums(a.position)
				obj:PivotTo(CFrame.new(p[1] or 0, p[2] or 0, p[3] or 0))
			end
			table.insert(paths, pathOf(obj))
		end
		return { inserted = paths }
	end)
end

TOOLS.sync_upsert = function(a)
	local done, errors = 0, {}
	recorded("synchronisation", function()
		for _, item in ipairs(a.items or {}) do
			local ok, err = pcall(upsertScript, item.path, item.className, item.source)
			if ok then
				done += 1
			else
				table.insert(errors, table.concat(item.path, "/") .. " : " .. tostring(err))
			end
		end
	end)
	if #errors > 0 and done == 0 then
		error(table.concat(errors, "\n"), 0)
	end
	return { updated = done, errors = errors }
end

TOOLS.sync_delete = function(a)
	local ok, inst = pcall(resolve, a.path)
	if ok and inst:GetAttribute(SYNC_ATTR) then
		recorded("synchronisation", function()
			inst:Destroy()
		end)
		return "supprimé"
	end
	return "ignoré"
end

TOOLS.pull_scripts = function(a)
	local all = {}
	for _, name in ipairs(SYNC_ROOTS) do
		local svc = game:FindFirstChild(name)
		if svc then
			for _, d in ipairs(svc:GetDescendants()) do
				if SCRIPT_CLASSES[d.ClassName] then
					table.insert(all, d)
				end
			end
		end
	end
	local start = math.max(1, tonumber(a.offset) or 1)
	local out, size = {}, 0
	local i = start
	while i <= #all do
		local scr = all[i]
		local ok, src = pcall(function()
			return scr.Source
		end)
		if ok then
			if size > 0 and size + #src > 400000 then
				break
			end
			size += #src
			scr:SetAttribute(SYNC_ATTR, true)
			watchScript(scr)
			table.insert(out, { path = pathArray(scr), className = scr.ClassName, source = src })
		end
		i += 1
	end
	return { scripts = out, nextOffset = (i <= #all) and i or nil, total = #all }
end

---------------------------------------------------------------------------
-- Connexion (long-polling)
---------------------------------------------------------------------------
local sessionId = HttpService:GenerateGUID(false)
local enabled = plugin:GetSetting("RoSwarmEnabled") ~= false
local connected = false

local toolbar = plugin:CreateToolbar("RoSwarm")
local button = toolbar:CreateButton("RoSwarm", "Connecter Studio à RoSwarm (agents IA)", "")
button.ClickableWhenViewportHidden = true

local function setConnected(v)
	if connected ~= v then
		connected = v
		if v then
			print("[RoSwarm] Connecté à l'application RoSwarm. Les agents IA peuvent travailler sur « " .. game.Name .. " ».")
		end
	end
	button:SetActive(enabled and connected)
end

local function handle(cmd)
	local fn = TOOLS[cmd.tool]
	local ok, res
	if not fn then
		ok, res = false, "Outil inconnu dans le plugin : " .. tostring(cmd.tool) .. " (mets à jour le plugin)"
	else
		ok, res = xpcall(fn, function(e)
			return tostring(e)
		end, cmd.args or {})
	end
	if ok then
		post("/plugin/result", { id = cmd.id, ok = true, result = res })
	else
		post("/plugin/result", { id = cmd.id, ok = false, error = res })
	end
end

button.Click:Connect(function()
	enabled = not enabled
	plugin:SetSetting("RoSwarmEnabled", enabled)
	if enabled then
		print("[RoSwarm] Connexion activée.")
	else
		print("[RoSwarm] Connexion désactivée : les agents ne peuvent plus toucher à cette place.")
	end
	setConnected(false)
end)

task.spawn(function()
	local warned = false
	while alive do
		if not enabled then
			task.wait(1)
		else
			local data, err = post("/plugin/poll", {
				sessionId = sessionId,
				placeName = game.Name,
				placeId = game.PlaceId,
				gameId = game.GameId,
				version = VERSION,
			})
			if data then
				warned = false
				setConnected(true)
				for _, cmd in ipairs(data.commands or {}) do
					task.spawn(handle, cmd)
				end
			else
				setConnected(false)
				if not warned then
					warned = true
					print("[RoSwarm] En attente de l'application RoSwarm sur " .. BASE .. " (" .. tostring(err) .. ")")
				end
				task.wait(3)
			end
		end
	end
end)
