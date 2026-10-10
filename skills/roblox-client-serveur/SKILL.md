---
name: roblox-client-serveur
description: À utiliser pour tout système qui implique le joueur (achat, dégâts, argent, inventaire, interactions) - séparation client/serveur, RemoteEvents/RemoteFunctions sécurisés, anti-triche.
---

# Client / serveur et sécurité

**Règle d'or : le client demande, le serveur décide.** Tout ce qui touche à l'argent, aux objets, aux dégâts, aux
stats ou à la progression est calculé et validé sur le serveur.

## Où mettre quoi
| Quoi | Où |
|---|---|
| Logique de jeu, données, achats | `ServerScriptService` (Script `.server.luau`) |
| Modules partagés, config, RemoteEvents | `ReplicatedStorage` |
| Modules serveur uniquement | `ServerStorage` |
| Interface, caméra, entrées | `StarterPlayerScripts`, `StarterGui` (LocalScript `.client.luau`) |

## RemoteEvents
- Range-les dans `ReplicatedStorage/Remotes`, créés une seule fois (par le serveur ou dans Studio).
- Côté serveur, **valide tout** ce qui arrive du client :
```lua
BuyEgg.OnServerEvent:Connect(function(player: Player, eggId: unknown)
	if typeof(eggId) ~= "string" then return end           -- type
	local egg = Config.Eggs[eggId]; if not egg then return end -- existe
	if not canAfford(player, egg.Price) then return end       -- règle de jeu côté serveur
	-- distance si l'action est physique : (player.Character.HumanoidRootPart.Position - shop.Position).Magnitude < 15
	grantEgg(player, eggId)
end)
```
- Ne fais jamais confiance à un prix, une quantité, une position ou un résultat envoyé par le client.
- Limite le débit (cooldown par joueur) pour les actions répétables.
- `RemoteFunction` : évite `InvokeClient` (un client peut ne jamais répondre) ; préfère des événements.

## Réplication
- Ce que le client modifie dans le Workspace n'est pas vu par les autres (sauf la physique de son personnage).
- Pour montrer un état à tous : le serveur modifie l'objet ou un `Attribute`, les clients écoutent `GetAttributeChangedSignal`.
