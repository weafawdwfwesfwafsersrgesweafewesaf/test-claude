--!strict
-- Tous les pets. Multiplier = bonus sur le +Power de chaque lancer.
-- Emoji = icône provisoire. Mets un rbxassetid dans Image quand tu as les vrais rendus.

export type Pet = {
	Name: string,
	Rarity: string,
	Multiplier: number,
	Emoji: string,
	Image: string,
}

local function pet(name: string, rarity: string, multiplier: number, emoji: string): Pet
	return { Name = name, Rarity = rarity, Multiplier = multiplier, Emoji = emoji, Image = "" }
end

local Pets: { [string]: Pet } = {
	-- Prairie
	Bunny = pet("Lapin", "Common", 1.1, "🐰"),
	Chick = pet("Poussin", "Common", 1.15, "🐥"),
	Frog = pet("Grenouille", "Uncommon", 1.3, "🐸"),
	Fox = pet("Renard", "Rare", 1.6, "🦊"),
	GoldenBee = pet("Abeille d'or", "Legendary", 3, "🐝"),
	-- Plage
	Crab = pet("Crabe", "Common", 1.4, "🦀"),
	Turtle = pet("Tortue", "Uncommon", 1.7, "🐢"),
	Dolphin = pet("Dauphin", "Rare", 2.2, "🐬"),
	Octopus = pet("Poulpe", "Epic", 3.2, "🐙"),
	Kraken = pet("Kraken", "Legendary", 5.5, "🦑"),
	-- Désert
	Scorpion = pet("Scorpion", "Common", 2, "🦂"),
	Camel = pet("Chameau", "Uncommon", 2.6, "🐫"),
	Lizard = pet("Lézard", "Rare", 3.4, "🦎"),
	Sphinx = pet("Sphinx", "Epic", 5, "🐱"),
	Pharaoh = pet("Pharaon", "Legendary", 9, "👑"),
	-- Banquise
	Penguin = pet("Pingouin", "Common", 3, "🐧"),
	Seal = pet("Phoque", "Uncommon", 4, "🦭"),
	PolarBear = pet("Ours polaire", "Rare", 5.5, "🐻‍❄️"),
	Yeti = pet("Yéti", "Epic", 8, "🦍"),
	FrostDragon = pet("Dragon de givre", "Legendary", 15, "🐉"),
	-- Volcan
	Salamander = pet("Salamandre", "Common", 4.5, "🦎"),
	LavaGolem = pet("Golem de lave", "Uncommon", 6, "🗿"),
	Phoenix = pet("Phénix", "Rare", 8.5, "🐦‍🔥"),
	MagmaHound = pet("Chien de magma", "Epic", 13, "🐕"),
	InfernoDragon = pet("Dragon infernal", "Mythic", 30, "🐲"),
	-- Bonbons
	Gummy = pet("Ourson gélifié", "Common", 7, "🧸"),
	Donut = pet("Donut", "Uncommon", 9, "🍩"),
	Unicorn = pet("Licorne", "Rare", 13, "🦄"),
	CandyKing = pet("Roi bonbon", "Epic", 20, "🍭"),
	SugarDragon = pet("Dragon sucré", "Mythic", 45, "🐲"),
	-- Cristal
	Gem = pet("Gemme", "Common", 11, "💎"),
	CrystalCat = pet("Chat de cristal", "Uncommon", 14, "😺"),
	PrismOwl = pet("Hibou prisme", "Rare", 20, "🦉"),
	CrystalWolf = pet("Loup de cristal", "Epic", 32, "🐺"),
	Diamondback = pet("Diamant vivant", "Mythic", 70, "💠"),
	-- Espace
	Alien = pet("Alien", "Common", 17, "👽"),
	Robot = pet("Robot", "Uncommon", 22, "🤖"),
	Comet = pet("Comète", "Rare", 32, "☄️"),
	Astronaut = pet("Astronaute", "Epic", 50, "🧑‍🚀"),
	BlackHole = pet("Trou noir", "Mythic", 110, "🌌"),
	StarGod = pet("Dieu des étoiles", "Secret", 400, "🌟"),
	-- Œuf Robux (Featured)
	BoneRaptor = pet("Raptor d'os", "Rare", 6, "🦖"),
	BoneStego = pet("Stégo d'os", "Rare", 7, "🦕"),
	BoneTrike = pet("Tricé d'os", "Epic", 10, "🦕"),
	BoneShark = pet("Requin d'os", "Epic", 14, "🦈"),
	BoneRex = pet("T-Rex d'os", "Legendary", 25, "🦖"),
	BoneWyvern = pet("Wyverne d'os", "Mythic", 60, "🐉"),
	BoneHydra = pet("Hydre d'os", "Secret", 200, "🐲"),
}

return Pets
