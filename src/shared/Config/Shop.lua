--!strict
-- Boutique : lanceurs (cash), gamepasses et produits Robux.
-- IMPORTANT : remplace les Id = 0 par les vrais IDs créés sur le Creator Hub.
-- Tant qu'un Id vaut 0, l'achat est simulé gratuitement DANS STUDIO uniquement (pour tester).

local Shop = {}

-- Lanceurs achetables avec le Cash. Multiplier s'applique à la distance (puissance effective).
Shop.Launchers = {
	{ Id = "Catapult", Name = "Catapulte", Price = 0, Multiplier = 1, Emoji = "🪃" },
	{ Id = "Slingshot", Name = "Lance-pierre", Price = 750, Multiplier = 1.5, Emoji = "🎯" },
	{ Id = "Cannon", Name = "Canon", Price = 8000, Multiplier = 2.5, Emoji = "💣" },
	{ Id = "Rocket", Name = "Fusée", Price = 75000, Multiplier = 4, Emoji = "🚀" },
	{ Id = "MegaCannon", Name = "Méga Canon", Price = 600000, Multiplier = 7, Emoji = "🧨" },
	{ Id = "Portal", Name = "Portail", Price = 5000000, Multiplier = 12, Emoji = "🌀" },
}

-- Gamepasses (achat unique)
Shop.GamePasses = {
	{ Key = "DoublePower", Id = 0, Price = 199, Title = "x2 Power", Line1 = "Gagne", Highlight = "2x", Line2 = "plus de Power !", Emoji = "💪", Theme = "Blue" },
	{ Key = "DoubleCash", Id = 0, Price = 149, Title = "x2 Cash", Line1 = "Gagne", Highlight = "2x", Line2 = "plus d'argent !", Emoji = "💵", Theme = "Gold" },
	{ Key = "AutoLaunch", Id = 0, Price = 249, Title = "Auto Launch", Line1 = "Lancer", Highlight = "auto", Line2 = "en boucle !", Emoji = "🔁", Theme = "Purple" },
	{ Key = "Lucky", Id = 0, Price = 299, Title = "Lucky", Line1 = "Chance", Highlight = "x2", Line2 = "sur les rares !", Emoji = "🍀", Theme = "Green" },
}

-- Produits (achat répétable). PowerLaunches = donne le Power de N lancers d'un coup.
Shop.Products = {
	BoneEgg1 = { Id = 0, Price = 90, Egg = "BoneEgg", Amount = 1, Label = "1 Œuf" },
	BoneEgg3 = { Id = 0, Price = 225, Egg = "BoneEgg", Amount = 3, Label = "3 Œufs" },
	BoneEgg10 = { Id = 0, Price = 720, Egg = "BoneEgg", Amount = 10, Label = "10 Œufs" },
	PowerSmall = { Id = 0, Price = 49, PowerLaunches = 50, Label = "Petit pack" },
	PowerMedium = { Id = 0, Price = 149, PowerLaunches = 200, Label = "Moyen pack" },
	PowerBig = { Id = 0, Price = 399, PowerLaunches = 700, Label = "Gros pack" },
}

-- Ordre d'affichage des boutons de l'œuf mis en avant (du plus gros au plus petit, comme ta capture)
Shop.FeaturedEgg = {
	Egg = "BoneEgg",
	Buttons = { "BoneEgg10", "BoneEgg3", "BoneEgg1" },
	-- Fin de l'offre (timestamp Unix UTC). 0 = pas de compte à rebours.
	EndsAt = 0,
}

Shop.PowerPacks = { "PowerSmall", "PowerMedium", "PowerBig" }

function Shop.GetLauncher(id: string)
	for index, launcher in ipairs(Shop.Launchers) do
		if launcher.Id == id then
			return launcher, index
		end
	end
	return Shop.Launchers[1], 1
end

function Shop.GetProductById(id: number): (string?, any)
	if id == 0 then
		return nil, nil
	end
	for key, product in pairs(Shop.Products) do
		if product.Id == id then
			return key, product
		end
	end
	return nil, nil
end

return Shop
