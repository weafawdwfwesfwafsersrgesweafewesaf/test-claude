---
name: roblox-monetisation
description: À utiliser pour les gamepasses, produits développeur (achats de monnaie, boosts), récompenses et boutiques en Robux - code d'achat correct et sûr.
---

# Monétisation

## Gamepass (achat unique)
```lua
local MarketplaceService = game:GetService("MarketplaceService")
local VIP_PASS = 123456 -- l'ID est créé par l'utilisateur sur le Creator Hub : demande-le, ne l'invente pas

local function hasPass(player: Player): boolean
	local ok, owns = pcall(MarketplaceService.UserOwnsGamePassAsync, MarketplaceService, player.UserId, VIP_PASS)
	return ok and owns
end
MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, bought)
	if bought and passId == VIP_PASS then --[[ donner l'avantage ]] end
end)
```

## Produit développeur (achat répétable)
- **Un seul** `MarketplaceService.ProcessReceipt` dans tout le jeu (serveur).
- Donne l'objet, **sauvegarde**, puis seulement ensuite renvoie `Enum.ProductPurchaseDecision.PurchaseGranted`.
- Si quelque chose échoue (joueur parti, sauvegarde ratée) : renvoie `NotProcessedYet` (Roblox réessaiera).
- Garde les `PurchaseId` déjà traités (dans les données du joueur) pour ne jamais donner deux fois.

## Règles
- Les IDs (gamepass, produits) viennent de l'utilisateur : demande-les, ou mets une constante clairement marquée « à remplacer ».
- Le client ne fait qu'ouvrir la fenêtre d'achat (`PromptProductPurchase`) ; le serveur donne la récompense.
- Les achats ne se testent pas vraiment dans Studio (achats simulés) : dis-le dans ton rapport.
