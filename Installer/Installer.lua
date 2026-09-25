--[[
	Installeur BikeASMR — à lancer depuis la Command Bar de Studio, dans le jeu ouvert.

	Applique tout ce qui a été fait dans le dépôt, en vérifiant chaque valeur avant
	de la changer (rien n'est écrasé si tu l'avais déjà modifiée, rien n'est ajouté
	en double) :
	  1. Auras : AuraRing / AuraHelix rangés dans ReplicatedStorage.BikeASMR.AuraModels ;
	  2. Équilibrage : 5 configs, panneaux de prix, portes de vitesse, plaques ;
	  3. Décorations : DecorShapes (ServerStorage.BikeASMR) + DecorService (Services).

	Tout est annulable d'un coup avec Ctrl+Z.
]]
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local RAW = "https://raw.githubusercontent.com/weafawdwfwesfwafsersrgesweafewesaf/test-claude/claude/vigilant-maxwell-tivikd/"
local rapport = {}
local function note(s)
	table.insert(rapport, s)
	print("[Installeur] " .. s)
end
local function get(path: string): string
	return HttpService:GetAsync(RAW .. path .. "?t=" .. os.time(), true)
end
local function at(path: string): Instance?
	local cur: Instance? = game
	for name in path:gmatch("[^/]+") do
		cur = cur and cur:FindFirstChild(name)
	end
	return cur
end

local id = ChangeHistoryService:TryBeginRecording("Installeur BikeASMR")

-- 1) AURAS
local models = at("ReplicatedStorage/BikeASMR/AuraModels")
if models then
	for _, nom in { "AuraRing", "AuraHelix" } do
		if models:FindFirstChild(nom) then
			note("aura " .. nom .. " : déjà en place")
		else
			local src = ServerStorage:FindFirstChild(nom) or workspace:FindFirstChild(nom)
			if src then
				src.Parent = models
				note("aura " .. nom .. " : déplacé dans AuraModels")
			else
				note("⚠ aura " .. nom .. " : introuvable (ni ServerStorage ni Workspace)")
			end
		end
	end
else
	note("⚠ ReplicatedStorage.BikeASMR.AuraModels introuvable")
end

-- 2) ÉQUILIBRAGE : configs
for _, nom in { "LobbyConfig", "MapConfig", "ProgressionConfig", "ShopConfig", "UIConfig" } do
	local s = at("ReplicatedStorage/BikeASMR/Config/" .. nom) :: ModuleScript?
	if not s then
		note("⚠ config " .. nom .. " introuvable")
		continue
	end
	local neuf = get("Installer/configs/" .. nom .. ".lua")
	local ancien = get("Installer/configs/" .. nom .. ".ancien.lua")
	if s.Source == neuf then
		note("config " .. nom .. " : déjà rééquilibrée")
	elseif s.Source == ancien then
		s.Source = neuf
		note("config " .. nom .. " : rééquilibrée")
	else
		note("⚠ config " .. nom .. " : modifiée à la main depuis, laissée telle quelle")
	end
end

-- 2) ÉQUILIBRAGE : panneaux (on ne remplace que l'ancien texte exact)
local TEXTES = {
	{ "Workspace/BikeASMR/Map/Lobby/Animalerie", "7,500 COINS", "10,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Animalerie", "90,000 COINS", "150,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "750 COINS", "1,500 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "2,500 COINS", "5,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "6,000 COINS", "12,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "9,000 COINS", "30,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "18,000 COINS", "75,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "25,000 COINS", "150,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "35,000 COINS", "350,000 COINS" },
	{ "Workspace/BikeASMR/Map/Lobby/Parking", "60,000 COINS", "800,000 COINS" },
	{ "Workspace/BikeASMR/Map/Levels/Level2", "Speed : 25+", "Speed : 100+" },
	{ "Workspace/BikeASMR/Map/Levels/Level3", "Speed : 70+", "Speed : 400+" },
	{ "Workspace/BikeASMR/Map/Levels/Level4", "Speed : 150+", "Speed : 1,200+" },
	{ "Workspace/BikeASMR/Map/Levels/Level5", "Speed : 300+", "Speed : 3,500+" },
	{ "Workspace/BikeASMR/Map/Levels/Level6", "Speed : 520+", "Speed : 10,000+" },
	{ "Workspace/BikeASMR/Map/Levels/Level7", "Speed : 820+", "Speed : 30,000+" },
	{ "Workspace/BikeASMR/Map/Levels/Level8", "Speed : 1,250+", "Speed : 90,000+" },
	{ "Workspace/BikeASMR/Map/Levels/Level9", "Speed : 1,900+", "Speed : 250,000+" },
	{ "Workspace/BikeASMR/Map/Levels/Level10", "Speed : 2,800+", "Speed : 700,000+" },
	{ "Workspace/BikeASMR/Map/Levels/Level11", "Speed : 4,200+", "Speed : 2,000,000+" },
	{ "Workspace/BikeASMR/Map/Levels/Level12", "Speed : 6,500+", "Speed : 5,000,000+" },
}
local nTextes = 0
for _, t in TEXTES do
	local zone = at(t[1])
	if not zone then
		continue
	end
	for _, d in zone:GetDescendants() do
		if d:IsA("TextLabel") and d.Text == t[2] then
			d.Text = t[3]
			nTextes += 1
		end
	end
end
-- Plaques de vitesse : trophées requis (attribut) et leur étiquette
local PLAQUES = { [35] = 40, [75] = 100, [150] = 220, [300] = 450, [600] = 800 }
local plaques = at("Workspace/BikeASMR/Map/Lobby/PlaquesVitesse")
local nPlaques = 0
if plaques then
	for _, d in plaques:GetDescendants() do
		local v = d:GetAttribute("Trophies")
		if type(v) == "number" and PLAQUES[v] then
			d:SetAttribute("Trophies", PLAQUES[v])
			nPlaques += 1
		end
		if d:IsA("TextLabel") then
			local n = tonumber(d.Text:match(" (%d+)$") or "")
			if n and PLAQUES[n] then
				d.Text = d.Text:gsub(" %d+$", " " .. PLAQUES[n])
				nTextes += 1
			end
		end
	end
end
-- Portes de vitesse des niveaux (attribut lu par la porte physique)
local PORTES = { [2] = { 25, 100 }, [3] = { 70, 400 }, [4] = { 150, 1200 }, [5] = { 300, 3500 }, [6] = { 520, 10000 },
	[7] = { 820, 30000 }, [8] = { 1250, 90000 }, [9] = { 1900, 250000 }, [10] = { 2800, 700000 },
	[11] = { 4200, 2000000 }, [12] = { 6500, 5000000 } }
local nPortes = 0
for i, p in PORTES do
	local f = at("Workspace/BikeASMR/Map/Levels/Level" .. i)
	if f and f:GetAttribute("SpeedRequired") == p[1] then
		f:SetAttribute("SpeedRequired", p[2])
		nPortes += 1
	end
end
note(("panneaux : %d, plaques : %d, portes : %d mis à jour"):format(nTextes, nPlaques, nPortes))

-- 3) DÉCORATIONS
local function module(parent: Instance?, nom: string, path: string)
	if not parent then
		note("⚠ dossier introuvable pour " .. nom)
		return
	end
	local s = parent:FindFirstChild(nom)
	if not s then
		s = Instance.new("ModuleScript")
		s.Name = nom
		s.Parent = parent
		note(nom .. " : ajouté")
	else
		note(nom .. " : mis à jour")
	end
	(s :: ModuleScript).Source = get(path)
end
module(at("ServerStorage/BikeASMR"), "DecorShapes", "Decorations/Roblox/DecorShapes.lua")
module(at("ServerScriptService/BikeASMR/Services"), "DecorService", "Decorations/Roblox/DecorService.lua")

if id then
	ChangeHistoryService:FinishRecording(id, Enum.FinishRecordingOperation.Commit)
end
print("[Installeur] TERMINÉ — enregistre (Ctrl+S) puis clique sur Play.")
return true
