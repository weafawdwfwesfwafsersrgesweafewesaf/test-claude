--!strict
-- Œufs et leurs chances. Weight = poids relatif (affiché en % automatiquement).

export type EggEntry = { Pet: string, Weight: number }
export type Egg = {
	Name: string,
	Color: Color3,
	Pets: { EggEntry },
	Robux: boolean,
}

local Eggs: { [string]: Egg } = {
	GrassEgg = {
		Name = "Œuf Prairie",
		Color = Color3.fromRGB(120, 220, 90),
		Robux = false,
		Pets = { { Pet = "Bunny", Weight = 50 }, { Pet = "Chick", Weight = 30 }, { Pet = "Frog", Weight = 15 }, { Pet = "Fox", Weight = 4.9 }, { Pet = "GoldenBee", Weight = 0.1 } },
	},
	BeachEgg = {
		Name = "Œuf Plage",
		Color = Color3.fromRGB(255, 225, 150),
		Robux = false,
		Pets = { { Pet = "Crab", Weight = 50 }, { Pet = "Turtle", Weight = 30 }, { Pet = "Dolphin", Weight = 15 }, { Pet = "Octopus", Weight = 4.9 }, { Pet = "Kraken", Weight = 0.1 } },
	},
	DesertEgg = {
		Name = "Œuf Désert",
		Color = Color3.fromRGB(240, 170, 80),
		Robux = false,
		Pets = { { Pet = "Scorpion", Weight = 50 }, { Pet = "Camel", Weight = 30 }, { Pet = "Lizard", Weight = 15 }, { Pet = "Sphinx", Weight = 4.9 }, { Pet = "Pharaoh", Weight = 0.1 } },
	},
	IceEgg = {
		Name = "Œuf Banquise",
		Color = Color3.fromRGB(180, 230, 255),
		Robux = false,
		Pets = { { Pet = "Penguin", Weight = 50 }, { Pet = "Seal", Weight = 30 }, { Pet = "PolarBear", Weight = 15 }, { Pet = "Yeti", Weight = 4.9 }, { Pet = "FrostDragon", Weight = 0.1 } },
	},
	LavaEgg = {
		Name = "Œuf Volcan",
		Color = Color3.fromRGB(255, 100, 40),
		Robux = false,
		Pets = { { Pet = "Salamander", Weight = 50 }, { Pet = "LavaGolem", Weight = 30 }, { Pet = "Phoenix", Weight = 15 }, { Pet = "MagmaHound", Weight = 4.95 }, { Pet = "InfernoDragon", Weight = 0.05 } },
	},
	CandyEgg = {
		Name = "Œuf Bonbon",
		Color = Color3.fromRGB(255, 150, 210),
		Robux = false,
		Pets = { { Pet = "Gummy", Weight = 50 }, { Pet = "Donut", Weight = 30 }, { Pet = "Unicorn", Weight = 15 }, { Pet = "CandyKing", Weight = 4.95 }, { Pet = "SugarDragon", Weight = 0.05 } },
	},
	CrystalEgg = {
		Name = "Œuf Cristal",
		Color = Color3.fromRGB(170, 120, 255),
		Robux = false,
		Pets = { { Pet = "Gem", Weight = 50 }, { Pet = "CrystalCat", Weight = 30 }, { Pet = "PrismOwl", Weight = 15 }, { Pet = "CrystalWolf", Weight = 4.95 }, { Pet = "Diamondback", Weight = 0.05 } },
	},
	SpaceEgg = {
		Name = "Œuf Espace",
		Color = Color3.fromRGB(60, 50, 120),
		Robux = false,
		Pets = { { Pet = "Alien", Weight = 50 }, { Pet = "Robot", Weight = 30 }, { Pet = "Comet", Weight = 15 }, { Pet = "Astronaut", Weight = 4.94 }, { Pet = "BlackHole", Weight = 0.05 }, { Pet = "StarGod", Weight = 0.01 } },
	},
	-- Œuf Robux mis en avant dans le Shop (comme "Fallen Angel Egg" sur ta capture)
	BoneEgg = {
		Name = "ŒUF D'OS MAUDIT",
		Color = Color3.fromRGB(245, 240, 225),
		Robux = true,
		Pets = { { Pet = "BoneRaptor", Weight = 40 }, { Pet = "BoneStego", Weight = 30 }, { Pet = "BoneTrike", Weight = 18 }, { Pet = "BoneShark", Weight = 9.9 }, { Pet = "BoneRex", Weight = 1 }, { Pet = "BoneWyvern", Weight = 1 }, { Pet = "BoneHydra", Weight = 0.1 } },
	},
}

return Eggs
