---
name: roblox-donnees
description: À utiliser pour sauvegarder la progression des joueurs (argent, niveaux, inventaire) - DataStoreService fiable, sans perte de données, avec leaderstats.
---

# Sauvegarde des données joueur

## Modèle minimal fiable (serveur)
```lua
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local store = DataStoreService:GetDataStore("PlayerData_v1")

local DEFAULT = { Coins = 0, Pets = {} }
local cache: { [Player]: any } = {}

local function withRetry(fn)
	for attempt = 1, 3 do
		local ok, result = pcall(fn)
		if ok then return true, result end
		task.wait(attempt * 2)
	end
	return false
end

Players.PlayerAdded:Connect(function(player)
	local ok, data = withRetry(function() return store:GetAsync("u_" .. player.UserId) end)
	if not ok then player:Kick("Impossible de charger tes données, reviens dans un instant.") return end
	cache[player] = data or table.clone(DEFAULT)
	-- leaderstats pour l'affichage
end)

local function save(player)
	local data = cache[player]; if not data then return end
	withRetry(function()
		store:UpdateAsync("u_" .. player.UserId, function() return data end)
	end)
end

Players.PlayerRemoving:Connect(function(player) save(player); cache[player] = nil end)
game:BindToClose(function() for _, p in Players:GetPlayers() do task.spawn(save, p) end task.wait(3) end)
```

## Règles
- Toujours `pcall` + nouvelles tentatives. Si le chargement échoue, **ne sauvegarde pas** par-dessus (sinon perte).
- `UpdateAsync` plutôt que `SetAsync` pour écrire.
- `BindToClose` obligatoire (fermeture du serveur).
- Sauvegarde automatique toutes les 2 à 5 minutes en plus.
- Versionne le nom du store (`_v1`) et gère les champs manquants (fusion avec `DEFAULT`) pour les mises à jour.
- Dans Studio, les DataStores ne marchent que si « Enable Studio Access to API Services » est activé (Paramètres du jeu > Sécurité) : préviens l'utilisateur.
