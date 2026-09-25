--!strict
--[[
	UIConfig — règles des écrans de l'UI, partagées client et serveur.

	Le client s'en sert pour AFFICHER (ce que vaut le jour 5, quand le cadeau 7
	sera prêt) ; le serveur pour DÉCIDER. Une seule table, donc jamais d'écart
	entre ce qu'on promet à l'écran et ce qu'on donne.
]]

local UIConfig = {}

--========================= REBIRTH =========================--
-- Vitesse nécessaire pour le prochain rebirth, et multiplicateur de vitesse gagnée.
function UIConfig.RebirthCost(rebirths: number): number
	return 10000 * (rebirths + 1)
end
function UIConfig.RebirthMultiplier(rebirths: number): number
	return 1 + 0.5 * rebirths
end

--========================= RÉCOMPENSE QUOTIDIENNE =========================--
-- Kind : Coins, Speed, CoinBoost (minutes de 2x pièces), Egg (un œuf gratuit), Chest.
UIConfig.DailyCooldown = 20 * 3600   -- on peut réclamer 20 h après la dernière fois
UIConfig.DailyBreak = 48 * 3600      -- au-delà, la série repart du jour 1
UIConfig.Daily = {
	{ Kind = "Coins", Amount = 500, Icon = "Coin", Label = "500" },
	{ Kind = "Speed", Amount = 50, Icon = "Speed", Label = "+50" },
	{ Kind = "Coins", Amount = 1500, Icon = "Cash", Label = "1,500" },
	{ Kind = "CoinBoost", Amount = 15, Icon = "PotionGreen", Label = "2X COINS" },
	{ Kind = "Coins", Amount = 5000, Icon = "Coin", Label = "5,000" },
	{ Kind = "Egg", Amount = 1, Icon = "EggGold", Label = "LUCKY EGG" },
	{ Kind = "Chest", Amount = 10000, Icon = "Chest", Label = "MEGA CHEST", Pet = "pet_robodog" },
}

--========================= CADEAUX DE TEMPS DE JEU =========================--
-- Minutes de présence dans la session avant de pouvoir ouvrir chaque cadeau.
UIConfig.Gifts = {
	{ Minutes = 1, Kind = "Coins", Amount = 250, Icon = "GiftPurple" },
	{ Minutes = 2, Kind = "Speed", Amount = 25, Icon = "GiftGreen" },
	{ Minutes = 3, Kind = "Coins", Amount = 500, Icon = "GiftRed" },
	{ Minutes = 4, Kind = "Speed", Amount = 50, Icon = "GiftPurple" },
	{ Minutes = 5, Kind = "Coins", Amount = 750, Icon = "GiftGreen" },
	{ Minutes = 8, Kind = "Coins", Amount = 1000, Icon = "GiftRed" },
	{ Minutes = 10, Kind = "Speed", Amount = 100, Icon = "GiftPurple" },
	{ Minutes = 15, Kind = "Coins", Amount = 2000, Icon = "GiftGreen" },
	{ Minutes = 20, Kind = "Speed", Amount = 150, Icon = "GiftRed" },
	{ Minutes = 30, Kind = "Coins", Amount = 3500, Icon = "GiftPurple" },
	{ Minutes = 45, Kind = "Speed", Amount = 250, Icon = "GiftGreen" },
	{ Minutes = 60, Kind = "Coins", Amount = 6000, Icon = "GiftRed" },
}

--========================= ŒUFS =========================--
--[[
	Les trois œufs du lobby. `Model` est le modèle 3D posé sur le stand ; chaque
	œuf donne l'un de ses cinq pets (du plus commun au plus rare). Un pet déjà
	possédé est remboursé : `Refund` × le prix de l'œuf, en pièces.
]]
UIConfig.Eggs = {
	{
		Id = "clavier", Name = "KEYBOARD EGG", Model = "Oeuf_Clavier", Price = 500, Refund = 0.3,
		Chances = {
			{ Id = "pet_hamster", Weight = 45 },
			{ Id = "pet_duck", Weight = 30 },
			{ Id = "pet_cat8bit", Weight = 16 },
			{ Id = "pet_robodog", Weight = 7 },
			{ Id = "pet_enterking", Weight = 2 },
		},
	},
	{
		Id = "volcan", Name = "VOLCANO EGG", Model = "Oeuf_VolcanGlace", Price = 7500, Refund = 0.3,
		Chances = {
			{ Id = "pet_ember", Weight = 45 },
			{ Id = "pet_penguin", Weight = 30 },
			{ Id = "pet_golem", Weight = 16 },
			{ Id = "pet_frostfox", Weight = 7 },
			{ Id = "pet_babydragon", Weight = 2 },
		},
	},
	{
		Id = "cosmique", Name = "COSMIC EGG", Model = "Oeuf_Cosmique", Price = 90000, Refund = 0.3,
		Chances = {
			{ Id = "pet_marshbear", Weight = 45 },
			{ Id = "pet_skelcat", Weight = 30 },
			{ Id = "pet_ghost", Weight = 16 },
			{ Id = "pet_jelly", Weight = 7 },
			{ Id = "pet_axolotl", Weight = 2 },
		},
	},
}

function UIConfig.GetEgg(id: string?): any
	for _, egg in UIConfig.Eggs do
		if egg.Id == id then
			return egg
		end
	end
	return UIConfig.Eggs[1]
end

-- Compatibilité : l'œuf par défaut (récompense quotidienne, anciens écrans).
UIConfig.Egg = UIConfig.Eggs[1]

--========================= ROBUX =========================--
--[[
	À remplir après création des Game Passes et Developer Products sur le site
	Roblox. Tant qu'un identifiant vaut 0, le bouton affiche « BIENTÔT » au lieu
	d'ouvrir une fenêtre d'achat vide.
]]
UIConfig.Passes = {
	VIP = 0, ["2xSpeed"] = 0, ["2xCoins"] = 0, TripleJump = 0, ["2xXP"] = 0, LuckyEggs = 0,
	-- Tapis roulants premium du lobby (LobbyConfig.Treadmills).
	TreadmillDragon = 0, TreadmillGhost = 0, TreadmillGalaxy = 0,
}
UIConfig.Products = {
	StarterPack = 0, Coins2500 = 0, Coins15000 = 0, Coins100000 = 0,
	Speed250 = 0, Speed1500 = 0, Speed10000 = 0, Revive = 0, SkipRebirth = 0, SkipGifts = 0,
}

return UIConfig
