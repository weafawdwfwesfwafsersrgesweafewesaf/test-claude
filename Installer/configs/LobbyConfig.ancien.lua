--!strict
--[[
	LobbyConfig — ce qui vit dans le lobby et qu'on débloque : les plaques de
	vitesse (trophées) et les tapis roulants (rebirths ou Robux).

	Partagé client et serveur : le client l'affiche, le serveur décide.
]]

local LobbyConfig = {}

--========================= PLAQUES DE VITESSE =========================--
--[[
	Les petites plaques jaunes. On roule dessus quand on a assez de trophées et le
	gain de vitesse par point passe au palier : les trophées NE SONT PAS dépensés,
	c'est un seuil à atteindre, pas un prix.

	Palier 1 = l'état de départ (pas de plaque). `Gain` = vitesse gagnée par point
	(par touche / par distance roulée), avant rebirths et pets.
]]
LobbyConfig.SpeedTiers = table.freeze({
	table.freeze({ Trophies = 0, Gain = 1 }),
	table.freeze({ Trophies = 5, Gain = 2 }),
	table.freeze({ Trophies = 15, Gain = 3 }),
	table.freeze({ Trophies = 35, Gain = 5 }),
	table.freeze({ Trophies = 75, Gain = 8 }),
	table.freeze({ Trophies = 150, Gain = 12 }),
	table.freeze({ Trophies = 300, Gain = 20 }),
	table.freeze({ Trophies = 600, Gain = 35 }),
	table.freeze({ Trophies = 1200, Gain = 60 }),
})

function LobbyConfig.TierGain(tier: number): number
	local t = LobbyConfig.SpeedTiers[math.clamp(math.floor(tier), 1, #LobbyConfig.SpeedTiers)]
	return t.Gain
end

--========================= TAPIS ROULANTS =========================--
--[[
	Un tapis par thème de modèle. `Rebirths` = nombre de rebirths qu'il faut AVOIR
	(3 veut dire : être au moins à son 3e rebirth). `Pass` = clé d'un Game Pass de
	UIConfig.Passes : ces tapis-là se débloquent en Robux, pas en rebirths.

	`Mult` multiplie la vitesse que le tapis fait « parcourir », donc les points
	gagnés en pédalant dessus.
]]
LobbyConfig.Treadmills = table.freeze({
	table.freeze({ Id = "Clavier", Name = "KEYBOARD", Rebirths = 0, Mult = 1, Color = Color3.fromRGB(88, 150, 255) }),
	table.freeze({ Id = "BonbonGeant", Name = "CANDY", Rebirths = 1, Mult = 1.5, Color = Color3.fromRGB(255, 110, 190) }),
	table.freeze({ Id = "Glace", Name = "ICE", Rebirths = 2, Mult = 2, Color = Color3.fromRGB(120, 220, 255) }),
	table.freeze({ Id = "Lave", Name = "LAVA", Rebirths = 3, Mult = 2.5, Color = Color3.fromRGB(255, 110, 40) }),
	table.freeze({ Id = "Robot", Name = "ROBOT", Rebirths = 5, Mult = 3, Color = Color3.fromRGB(60, 200, 255) }),
	table.freeze({ Id = "Squelette", Name = "SKELETON", Rebirths = 8, Mult = 4, Color = Color3.fromRGB(120, 255, 140) }),
	table.freeze({ Id = "Retro8bit", Name = "RETRO", Rebirths = 12, Mult = 5, Color = Color3.fromRGB(255, 70, 110) }),
	table.freeze({ Id = "Dragon", Name = "DRAGON", Pass = "TreadmillDragon", Mult = 6, Color = Color3.fromRGB(255, 70, 40) }),
	table.freeze({ Id = "Fantome", Name = "GHOST", Pass = "TreadmillGhost", Mult = 8, Color = Color3.fromRGB(150, 255, 210) }),
	table.freeze({ Id = "Galaxie", Name = "GALAXY", Pass = "TreadmillGalaxy", Mult = 12, Color = Color3.fromRGB(170, 110, 255) }),
})

function LobbyConfig.GetTreadmill(id: string): any
	for _, t in LobbyConfig.Treadmills do
		if t.Id == id then
			return t
		end
	end
	return nil
end

return LobbyConfig
