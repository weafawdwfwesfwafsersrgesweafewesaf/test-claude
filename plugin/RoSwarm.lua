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

local VERSION = "0.2.0"
local PORT = tonumber(plugin:GetSetting("RoSwarmPort")) or 34900
local BASE = "http://127.0.0.1:" .. PORT
local SYNC_ATTR = "RoSwarm"
local SEQ_ATTR = "RoSwarmSeq"
local MAX_SOURCE = 2 * 1024 * 1024

local alive = true
plugin.Unloading:Connect(function()
	alive = false
end)

local isPlay = RunService:IsRunning()

---------------------------------------------------------------------------
-- Connexion : jeton (obtenu par appairage), session (donnée par le serveur)
---------------------------------------------------------------------------
local conn = { token = plugin:GetSetting("RoSwarmToken"), sessionId = nil, lastPollId = 0 }
if type(conn.token) ~= "string" or #conn.token ~= 64 then
	conn.token = nil
end
local instanceId = HttpService:GenerateGUID(false)

local function forgetToken(reason)
	conn.token = nil
	conn.sessionId = nil
	plugin:SetSetting("RoSwarmToken", "")
	print("[RoSwarm] " .. reason .. " Une nouvelle autorisation va être demandée.")
end

-- Renvoie data, ou nil + message d'erreur + code HTTP + code d'erreur RoSwarm.
local function request(route, body, auth)
	local okEnc, encoded = pcall(HttpService.JSONEncode, HttpService, body)
	if not okEnc then
		return nil, "JSON : " .. tostring(encoded), 0
	end
	local headers = { ["Content-Type"] = "application/json" }
	if auth then
		if not conn.token then
			return nil, "plugin non autorisé", 401, "BAD_TOKEN"
		end
		headers["X-RoSwarm-Plugin"] = conn.token
	end
	local ok, res = pcall(function()
		return HttpService:RequestAsync({ Url = BASE .. route, Method = "POST", Headers = headers, Body = encoded })
	end)
	if not ok then
		return nil, tostring(res), 0
	end
	local okDec, data = pcall(HttpService.JSONDecode, HttpService, res.Body)
	if not res.Success then
		local isTable = okDec and type(data) == "table"
		return nil, (isTable and data.error) or tostring(res.StatusCode), res.StatusCode, isTable and data.code or nil
	end
	if not okDec or type(data) ~= "table" then
		return nil, "réponse invalide", res.StatusCode
	end
	return data
end

-- Appairage : le plugin demande l'accès, l'utilisateur clique « Autoriser » dans RoSwarm.
local pairing = nil
local function pairStep()
	if not pairing then
		local code = tostring(Random.new():NextInteger(1000, 9999))
		local p = { requestId = HttpService:GenerateGUID(false), code = code }
		local data, err = request("/plugin/pair", { requestId = p.requestId, code = code, placeName = game.Name }, false)
		if not data then
			return false, err
		end
		pairing = p
		print(
			"[RoSwarm] Autorisation nécessaire : dans l'application RoSwarm, clique « Autoriser » pour « "
				.. game.Name
				.. " » (vérifie que le code affiché est "
				.. code
				.. ")."
		)
	end
	local data, err = request("/plugin/pair-status", { requestId = pairing.requestId }, false)
	if not data then
		return false, err
	end
	if data.status == "approved" and type(data.token) == "string" then
		conn.token = data.token
		plugin:SetSetting("RoSwarmToken", data.token)
		pairing = nil
		print("[RoSwarm] Plugin autorisé. Connexion à RoSwarm…")
		return true
	elseif data.status == "rejected" then
		pairing = nil
		print("[RoSwarm] Autorisation refusée dans RoSwarm. Nouvel essai dans une minute.")
		task.wait(60)
	elseif data.status == "unknown" then
		pairing = nil -- demande expirée : on en refait une
	end
	return false
end

local function hello()
	local data, err, _status, code = request("/plugin/hello", {
		instanceId = instanceId,
		placeName = game.Name,
		placeId = game.PlaceId,
		gameId = game.GameId,
		version = VERSION,
		logOnly = isPlay,
	}, true)
	if data and type(data.sessionId) == "string" then
		if not data.resumed then
			conn.lastPollId = 0
		end
		conn.sessionId = data.sessionId
		return true
	end
	if code == "BAD_TOKEN" then
		forgetToken("Autorisation révoquée ou inconnue.")
	end
	return false, err
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
	if #logQueue >= 500 then
		table.remove(logQueue, 1)
	end
	table.insert(logQueue, { text = message, level = LEVELS[messageType] or "info" })
end)

task.spawn(function()
	while alive do
		task.wait(1)
		if #logQueue > 0 and conn.token then
			if not conn.sessionId and isPlay then
				hello()
			end
			if conn.sessionId then
				local batch = logQueue
				logQueue = {}
				local data, _, _, code = request("/plugin/log", { sessionId = conn.sessionId, messages = batch, play = isPlay }, true)
				if not data then
					-- on garde les messages pour le prochain essai
					for i = #batch, 1, -1 do
						if #logQueue < 500 then
							table.insert(logQueue, 1, batch[i])
						end
					end
					if code == "BAD_SESSION" and isPlay then
						conn.sessionId = nil
					end
				end
			end
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

-- Empreinte FNV-1a 32 bits (identique à fnv1a() dans server/syncCore.js), fins de ligne normalisées en LF.
-- roswarm:fnv1a:begin
local function fnv1a(s)
	s = string.gsub(s, "\r\n", "\n")
	local h = 2166136261
	local n = #s
	local i = 1
	while i <= n do
		local j = math.min(i + 3999, n)
		local bytes = { string.byte(s, i, j) }
		for k = 1, #bytes do
			h = bit32.bxor(h, bytes[k])
			-- h * 16777619 mod 2^32, avec 16777619 = 2^24 + 403 (évite de dépasser la précision des nombres)
			h = (bit32.lshift(h, 24) + h * 403) % 4294967296
		end
		i = j + 1
	end
	return string.format("%08x", h)
end
-- roswarm:fnv1a:end

local function setSource(scr, source)
	if ScriptEditorService and scr.Parent then
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

-- Studio -> fichiers : quand un script synchronisé est modifié dans Studio.
-- Chaque script modifié reçoit un numéro de version ; il ne quitte la file qu'une fois confirmé par le serveur.
local watched = setmetatable({}, { __mode = "k" })
local changedQueue = {} -- script -> version
local changeCounter = 0
local suppress = setmetatable({}, { __mode = "k" })

local function watchScript(scr)
	if watched[scr] then
		return
	end
	watched[scr] = scr:GetPropertyChangedSignal("Source"):Connect(function()
		if suppress[scr] then
			return
		end
		changeCounter += 1
		changedQueue[scr] = changeCounter
	end)
end

task.spawn(function()
	while alive do
		task.wait(1.5)
		if conn.sessionId and next(changedQueue) then
			local items, sent = {}, {}
			for scr, version in pairs(changedQueue) do
				if scr.Parent and scr:GetAttribute(SYNC_ATTR) then
					local ok, src = pcall(function()
						return scr.Source
					end)
					if ok and #src <= MAX_SOURCE then
						table.insert(items, { path = pathArray(scr), className = scr.ClassName, source = src })
						table.insert(sent, { scr = scr, version = version })
					else
						changedQueue[scr] = nil
					end
				else
					changedQueue[scr] = nil
				end
				if #items >= 50 then
					break
				end
			end
			if #items > 0 then
				local data = request("/plugin/changes", { sessionId = conn.sessionId, items = items }, true)
				if data then
					for _, s in ipairs(sent) do
						if changedQueue[s.scr] == s.version then
							changedQueue[s.scr] = nil -- pas remodifié entre-temps
						end
					end
				end
			end
		end
	end
end)

local function validParts(parts)
	if type(parts) ~= "table" or #parts < 2 or #parts > 30 then
		return false
	end
	for _, p in ipairs(parts) do
		if type(p) ~= "string" or p == "" or #p > 100 then
			return false
		end
	end
	return true
end

-- Crée ou met à jour un script. item = { path, className, source, seq? }. Renvoie { status, syntaxError?, replacedUntagged? }.
local function upsertScript(item)
	local parts, className, source = item.path, item.className, item.source
	local seq = tonumber(item.seq)
	if not validParts(parts) then
		error("chemin invalide", 0)
	end
	if not SCRIPT_CLASSES[className] then
		error("classe invalide : " .. tostring(className), 0)
	end
	if type(source) ~= "string" or #source > MAX_SOURCE then
		error("source invalide ou trop grosse", 0)
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
	local result = { status = "applied" }
	if existing and existing:IsA("LuaSourceContainer") then
		local cur = existing:GetAttribute(SEQ_ATTR)
		if seq and type(cur) == "number" and cur > seq then
			return { status = "stale" } -- une version plus récente est déjà appliquée
		end
		local okS, old = pcall(function()
			return existing.Source
		end)
		if okS and not existing:GetAttribute(SYNC_ATTR) and fnv1a(old) ~= fnv1a(source) then
			result.replacedUntagged = old -- script écrit à la main dans Studio : le serveur en garde une copie
		end
	end
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
	if scr.Parent ~= parent then
		scr.Parent = parent
	end
	local okCur, current = pcall(function()
		return scr.Source
	end)
	if not (okCur and current == source) then
		setSource(scr, source)
	end
	scr:SetAttribute(SYNC_ATTR, true)
	if seq then
		scr:SetAttribute(SEQ_ATTR, seq)
	end
	task.defer(function()
		suppress[scr] = nil
	end)
	watchScript(scr)
	-- Vérification de la syntaxe par le compilateur Luau de Studio (rien n'est exécuté).
	local f, err = loadstring(source)
	if not f then
		result.syntaxError = tostring(err)
	end
	return result, scr
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
	local _, scr = recorded("set_script_source", function()
		return upsertScript({ path = parts, className = className, source = a.source or "" })
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
	if type(a.items) ~= "table" then
		error("items manquant", 0)
	end
	local out = {}
	recorded("synchronisation", function()
		for i, item in ipairs(a.items) do
			local ok, res = pcall(upsertScript, item)
			out[i] = ok and res or { status = "error", error = tostring(res) }
		end
	end)
	return { items = out }
end

-- Suppression d'un script synchronisé. Ses enfants ne sont jamais détruits : ils passent dans un Folder du même nom.
TOOLS.sync_delete = function(a)
	local ok, inst = pcall(resolve, a.path)
	if not ok then
		return { status = "missing" }
	end
	if not inst:IsA("LuaSourceContainer") or not inst:GetAttribute(SYNC_ATTR) then
		return { status = "kept", reason = "ce n'est pas un script synchronisé par RoSwarm" }
	end
	recorded("synchronisation", function()
		local kids = inst:GetChildren()
		if #kids > 0 then
			local folder = Instance.new("Folder")
			folder.Name = inst.Name
			folder.Parent = inst.Parent
			for _, c in ipairs(kids) do
				c.Parent = folder
			end
		end
		inst:Destroy()
	end)
	return { status = "deleted" }
end

local function syncedScripts()
	local list = {}
	for _, name in ipairs(SYNC_ROOTS) do
		local svc = game:FindFirstChild(name)
		if svc then
			for _, d in ipairs(svc:GetDescendants()) do
				if SCRIPT_CLASSES[d.ClassName] and d:GetAttribute(SYNC_ATTR) then
					table.insert(list, d)
				end
			end
		end
	end
	return list
end

-- Empreintes des scripts synchronisés : sert à la réconciliation après une (re)connexion.
TOOLS.sync_manifest = function()
	local out = {}
	for i, scr in ipairs(syncedScripts()) do
		local ok, src = pcall(function()
			return scr.Source
		end)
		if ok and scr.Parent then
			table.insert(out, { path = pathArray(scr), className = scr.ClassName, hash = fnv1a(src) })
		end
		if i % 50 == 0 then
			task.wait()
		end
	end
	return { scripts = out }
end

TOOLS.get_sources = function(a)
	local out = {}
	for i, p in ipairs(a.paths or {}) do
		local ok, inst = pcall(resolve, p)
		if ok and inst:IsA("LuaSourceContainer") then
			out[i] = { source = inst.Source }
		else
			out[i] = { missing = true }
		end
	end
	return { sources = out }
end

-- Vérifie la syntaxe (compilation Luau, sans exécution) des scripts donnés ou de tous les scripts synchronisés.
TOOLS.check_scripts = function(a)
	local targets = {}
	if type(a.paths) == "table" and #a.paths > 0 then
		for _, p in ipairs(a.paths) do
			local ok, inst = pcall(resolve, p)
			if ok and inst:IsA("LuaSourceContainer") then
				table.insert(targets, inst)
			end
		end
	else
		targets = syncedScripts()
	end
	local errors = {}
	for i, scr in ipairs(targets) do
		local ok, src = pcall(function()
			return scr.Source
		end)
		if ok then
			local f, err = loadstring(src)
			if not f then
				table.insert(errors, { path = pathOf(scr), error = tostring(err) })
			end
		end
		if i % 50 == 0 then
			task.wait()
		end
	end
	return { checked = #targets, errors = errors }
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
-- Exécution des commandes (au moins une fois, sans double exécution)
---------------------------------------------------------------------------
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

-- Commandes déjà reçues : si le serveur renvoie une commande (réponse perdue), on renvoie le même résultat
-- au lieu de l'exécuter une deuxième fois.
local executed = {}
local executedOrder = {}

local function remember(id, entry)
	executed[id] = entry
	table.insert(executedOrder, id)
	if #executedOrder > 300 then
		executed[table.remove(executedOrder, 1)] = nil
	end
end

local function sendResult(payload)
	for attempt = 1, 4 do
		payload.sessionId = conn.sessionId
		local data, _, status, code = request("/plugin/result", payload, true)
		if data or code == "BAD_SESSION" or code == "BAD_TOKEN" or status == 403 or status == 409 then
			return
		end
		task.wait(attempt)
	end
end

local function handle(cmd)
	if type(cmd) ~= "table" or type(cmd.id) ~= "string" then
		return
	end
	local prev = executed[cmd.id]
	if prev then
		if prev.payload then
			sendResult(prev.payload)
		end
		return
	end
	local entry = {}
	remember(cmd.id, entry)
	local fn = TOOLS[cmd.tool]
	local ok, res
	if not fn then
		ok, res = false, "Outil inconnu dans le plugin : " .. tostring(cmd.tool) .. " (mets à jour le plugin)"
	else
		ok, res = xpcall(fn, function(e)
			return tostring(e)
		end, type(cmd.args) == "table" and cmd.args or {})
	end
	local payload = ok and { id = cmd.id, ok = true, result = res } or { id = cmd.id, ok = false, error = tostring(res) }
	if not pcall(HttpService.JSONEncode, HttpService, payload) then
		payload = { id = cmd.id, ok = false, error = "Résultat non sérialisable en JSON" }
	end
	entry.payload = payload
	sendResult(payload)
end

button.Click:Connect(function()
	enabled = not enabled
	plugin:SetSetting("RoSwarmEnabled", enabled)
	if enabled then
		print("[RoSwarm] Connexion activée.")
	else
		print("[RoSwarm] Connexion désactivée : les agents ne peuvent plus toucher à cette place.")
		conn.sessionId = nil
	end
	setConnected(false)
end)

task.spawn(function()
	local warned = false
	while alive do
		if not enabled then
			task.wait(1)
		elseif not conn.token then
			setConnected(false)
			local ok, err = pairStep()
			if not ok then
				if err and not warned then
					warned = true
					print("[RoSwarm] En attente de l'application RoSwarm sur " .. BASE .. " (" .. tostring(err) .. ")")
				end
				task.wait(2)
			end
		elseif not conn.sessionId then
			local ok, err = hello()
			if ok then
				warned = false
			else
				setConnected(false)
				if not warned then
					warned = true
					print("[RoSwarm] En attente de l'application RoSwarm sur " .. BASE .. " (" .. tostring(err) .. ")")
				end
				task.wait(3)
			end
		else
			local data, err, status, code = request("/plugin/poll", { sessionId = conn.sessionId, lastPollId = conn.lastPollId }, true)
			if data then
				warned = false
				setConnected(true)
				if type(data.pollId) == "number" then
					conn.lastPollId = data.pollId
				end
				for _, cmd in ipairs(data.commands or {}) do
					task.spawn(handle, cmd)
				end
			elseif code == "BAD_SESSION" then
				conn.sessionId = nil -- RoSwarm a redémarré ou la session a expiré : on en rouvre une
			elseif code == "BAD_TOKEN" then
				forgetToken("Autorisation révoquée.")
			else
				setConnected(false)
				if not warned then
					warned = true
					print("[RoSwarm] Connexion perdue avec RoSwarm (" .. tostring(err) .. "), nouvel essai…")
				end
				task.wait(status == 429 and 10 or 2)
			end
		end
	end
end)
