--!strict
-- Les zones de la piste, dans l'ordre. Start = distance (studs) depuis le lanceur.
-- Atterrir dans une zone casse l'œuf de cette zone.

export type Zone = {
	Name: string,
	Start: number,
	Egg: string,
	Ground: Color3,
	Accent: Color3,
	Material: Enum.Material,
}

local Zones: { Zone } = {
	{ Name = "Prairie", Start = 0, Egg = "GrassEgg", Ground = Color3.fromRGB(91, 196, 62), Accent = Color3.fromRGB(255, 226, 90), Material = Enum.Material.Plastic },
	{ Name = "Plage", Start = 200, Egg = "BeachEgg", Ground = Color3.fromRGB(246, 215, 140), Accent = Color3.fromRGB(64, 196, 255), Material = Enum.Material.Plastic },
	{ Name = "Désert", Start = 500, Egg = "DesertEgg", Ground = Color3.fromRGB(240, 160, 72), Accent = Color3.fromRGB(196, 92, 40), Material = Enum.Material.Plastic },
	{ Name = "Banquise", Start = 1000, Egg = "IceEgg", Ground = Color3.fromRGB(222, 244, 255), Accent = Color3.fromRGB(110, 200, 255), Material = Enum.Material.Plastic },
	{ Name = "Volcan", Start = 1800, Egg = "LavaEgg", Ground = Color3.fromRGB(70, 44, 44), Accent = Color3.fromRGB(255, 96, 32), Material = Enum.Material.Plastic },
	{ Name = "Bonbons", Start = 3000, Egg = "CandyEgg", Ground = Color3.fromRGB(255, 150, 210), Accent = Color3.fromRGB(140, 255, 230), Material = Enum.Material.Plastic },
	{ Name = "Cristal", Start = 4500, Egg = "CrystalEgg", Ground = Color3.fromRGB(150, 98, 230), Accent = Color3.fromRGB(120, 255, 255), Material = Enum.Material.Plastic },
	{ Name = "Espace", Start = 6500, Egg = "SpaceEgg", Ground = Color3.fromRGB(34, 30, 70), Accent = Color3.fromRGB(255, 80, 255), Material = Enum.Material.Plastic },
}

local ZonesModule = {}
ZonesModule.List = Zones
-- Fin de la piste construite (un peu après la distance max)
ZonesModule.TrackEnd = 9600

function ZonesModule.GetIndexForDistance(distance: number): number
	local index = 1
	for i, zone in ipairs(Zones) do
		if distance >= zone.Start then
			index = i
		end
	end
	return index
end

function ZonesModule.GetEnd(index: number): number
	local nextZone = Zones[index + 1]
	return if nextZone then nextZone.Start else ZonesModule.TrackEnd
end

return ZonesModule
