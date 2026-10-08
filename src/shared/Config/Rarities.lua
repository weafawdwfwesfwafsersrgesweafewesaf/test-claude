--!strict
-- Raretés : mêmes couleurs partout (inventaire, éclosion, notifications).

export type Rarity = {
	Name: string,
	Order: number,
	Color: Color3,
	Dark: Color3,
	Rainbow: boolean,
	Announce: boolean, -- message à tout le serveur
	Lucky: boolean, -- boostée par le gamepass Lucky
	Shakes: number, -- tremblements de l'œuf à l'éclosion
}

local Rarities: { [string]: Rarity } = {
	Common = { Name = "Commun", Order = 1, Color = Color3.fromRGB(190, 196, 204), Dark = Color3.fromRGB(96, 102, 112), Rainbow = false, Announce = false, Lucky = false, Shakes = 2 },
	Uncommon = { Name = "Peu commun", Order = 2, Color = Color3.fromRGB(110, 230, 70), Dark = Color3.fromRGB(46, 128, 26), Rainbow = false, Announce = false, Lucky = false, Shakes = 2 },
	Rare = { Name = "Rare", Order = 3, Color = Color3.fromRGB(60, 160, 255), Dark = Color3.fromRGB(20, 80, 170), Rainbow = false, Announce = false, Lucky = true, Shakes = 3 },
	Epic = { Name = "Épique", Order = 4, Color = Color3.fromRGB(176, 80, 255), Dark = Color3.fromRGB(96, 28, 160), Rainbow = false, Announce = false, Lucky = true, Shakes = 3 },
	Legendary = { Name = "Légendaire", Order = 5, Color = Color3.fromRGB(255, 196, 40), Dark = Color3.fromRGB(170, 104, 0), Rainbow = false, Announce = true, Lucky = true, Shakes = 4 },
	Mythic = { Name = "Mythique", Order = 6, Color = Color3.fromRGB(255, 60, 110), Dark = Color3.fromRGB(150, 10, 50), Rainbow = false, Announce = true, Lucky = true, Shakes = 5 },
	Secret = { Name = "SECRET", Order = 7, Color = Color3.fromRGB(30, 30, 36), Dark = Color3.fromRGB(0, 0, 0), Rainbow = true, Announce = true, Lucky = true, Shakes = 6 },
}

return Rarities
