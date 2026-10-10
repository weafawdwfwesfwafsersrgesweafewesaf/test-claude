---
name: roblox-luau
description: Bonnes pratiques Luau pour écrire ou relire n'importe quel script Roblox (Script, LocalScript, ModuleScript) - structure, types, performance, pièges courants.
---

# Luau propre pour Roblox

## Structure d'un script
```lua
--!strict
local Players = game:GetService("Players")          -- 1. services (toujours GetService)
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Config)     -- 2. modules

local COIN_VALUE = 10                                -- 3. constantes en MAJUSCULES

local function giveCoins(player: Player, amount: number) -- 4. fonctions locales typées
	local coins = player:FindFirstChild("leaderstats") and player.leaderstats:FindFirstChild("Coins")
	if coins then
		coins.Value += amount
	end
end

Players.PlayerAdded:Connect(function(player)        -- 5. connexions à la fin
	giveCoins(player, COIN_VALUE)
end)
```

## Règles
- Toujours `local`. Jamais de variables globales.
- `task.wait`, `task.spawn`, `task.delay`, `task.defer` (jamais `wait`, `spawn`, `delay`).
- `WaitForChild` côté client pour ce qui est répliqué ; côté serveur, accès direct si l'objet existe au démarrage.
- `--!strict` + types sur les fonctions publiques des modules.
- Un ModuleScript renvoie une table ; pas d'effets de bord au `require` sauf si c'est voulu.
- Déconnecte les connexions inutiles (`conn:Disconnect()`), surtout sur des objets qui vivent longtemps.
- Nettoyage joueur : `Players.PlayerRemoving` pour libérer les tables indexées par joueur (sinon fuite mémoire).

## Performance
- Pas de boucle `while true do task.wait() end` pour vérifier un état : utilise des événements (`.Changed`, `GetPropertyChangedSignal`, `Touched`, `Heartbeat` si vraiment nécessaire).
- `CollectionService` + tags au lieu d'un script par objet (une pièce = un tag, un seul script gère toutes les pièces).
- Mets en cache les références (`local part = workspace.Map.Part`) hors des boucles.
- `table.create`, `table.clear`, `buffer` pour les grosses structures.

## Pièges fréquents
- `Touched` se déclenche plusieurs fois : ajoute un anti-rebond (table de joueurs récents ou attribut).
- `FindFirstChild` renvoie `nil` : vérifie avant d'indexer.
- Les `.Value` des `IntValue`/`NumberValue` répliqués ne sont modifiables de façon fiable que par le serveur.
