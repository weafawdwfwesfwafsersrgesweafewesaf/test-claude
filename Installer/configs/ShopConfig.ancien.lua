--!strict
--[[
	ShopConfig — catalogue des cosmétiques et des pets.

	Règle de design : seuls les pets touchent aux stats, et de façon modérée
	(+25% max). Vélos / trails / auras restent purement visuels, pour que la
	monétisation ne déséquilibre pas le classement.

	Currency : "Coins" (gagnée en jeu) ou "Robux" (produit développé plus tard,
	ProductId à remplir au moment de la publication).
]]

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

export type Item = {
	Id: string,
	Name: string,
	Category: string,
	Price: number,
	Currency: string,
	Rarity: string,
	Color: Color3?,
	SecondaryColor: Color3?,
	LevelRequired: number?,
	ProductId: number?,
	-- UI : image de la carte (UIAssets.Assets), thème Blender (trails/auras), modèle 3D (pets).
	Art: string?,
	Theme: string?,
	Model: string?,
	Stats: { SpeedBonus: number?, CoinBonus: number?, XpBonus: number? }?,
	--[[
		LIVRÉE D'UN VÉLO.

		On ne stocke pas six modèles, on stocke six PALETTES. Le vélo est un
		assemblage de parts aux pièces nommées ; BikeService repeint par nom au
		moment où le joueur l'équipe. Six modèles séparés auraient voulu dire six
		gabarits à corriger à chaque retouche du vélo, et six fois plus à charger.
	]]
	Skin: {
		Frame: Color3, Accent: Color3, Metal: Color3, Dark: Color3, Tread: Color3,
		FrameMaterial: Enum.Material?, AccentMaterial: Enum.Material?,
	}?,
}

local Rarity = table.freeze({
	Common = "Commun",
	Rare = "Rare",
	Epic = "Épique",
	Legendary = "Légendaire",
})

local RarityColors = table.freeze({
	["Commun"] = rgb(160, 170, 185),
	["Rare"] = rgb(80, 160, 255),
	["Épique"] = rgb(180, 100, 255),
	["Légendaire"] = rgb(255, 190, 60),
})

--========================= VÉLOS =========================--
--[[
	Les dix vélos de l'UI (maquettes Figma) : un par thème du jeu. `Art` nomme
	l'image de la carte dans UIAssets, `Skin` repeint le vélo réel (BikeService).
	Le premier est OFFERT et équipé d'office.
]]
local function skin(frame: Color3, accent: Color3, extra: { [string]: any }?)
	local s: any = { Frame = frame, Accent = accent, Metal = rgb(201, 205, 224), Dark = rgb(35, 35, 58), Tread = rgb(52, 52, 79) }
	for k, v in extra or {} do s[k] = v end
	return s
end
local Bikes: { Item } = {
	{ Id = "bike_keyboard", Name = "Keyboard", Category = "Bike", Price = 0, Currency = "Coins", Rarity = Rarity.Common, Art = "BikeKeyboard", Theme = "Clavier", Skin = skin(rgb(58, 107, 255), rgb(42, 255, 122)) },
	{ Id = "bike_lava", Name = "Lava", Category = "Bike", Price = 750, Currency = "Coins", Rarity = Rarity.Common, Art = "BikeLava", Theme = "Lave", Skin = skin(rgb(255, 30, 0), rgb(255, 176, 0), { AccentMaterial = Enum.Material.Neon }) },
	{ Id = "bike_ice", Name = "Ice", Category = "Bike", Price = 2500, Currency = "Coins", Rarity = Rarity.Rare, Art = "BikeIce", Theme = "Glace", Skin = skin(rgb(42, 168, 255), rgb(191, 242, 255)) },
	{ Id = "bike_candy", Name = "Candy", Category = "Bike", Price = 6000, Currency = "Coins", Rarity = Rarity.Rare, Art = "BikeCandy", Theme = "BonbonGeant", Skin = skin(rgb(255, 79, 155), rgb(255, 216, 74)) },
	{ Id = "bike_robot", Name = "Robot", Category = "Bike", Price = 9000, Currency = "Coins", Rarity = Rarity.Rare, Art = "BikeRobot", Theme = "Robot", Skin = skin(rgb(29, 107, 214), rgb(53, 232, 255), { FrameMaterial = Enum.Material.Metal }) },
	{ Id = "bike_dragon", Name = "Dragon", Category = "Bike", Price = 18000, Currency = "Coins", Rarity = Rarity.Epic, Art = "BikeDragon", Theme = "Dragon", Skin = skin(rgb(179, 32, 15), rgb(255, 210, 26)) },
	{ Id = "bike_skeleton", Name = "Skeleton", Category = "Bike", Price = 25000, Currency = "Coins", Rarity = Rarity.Epic, Art = "BikeSkeleton", Theme = "Squelette", Skin = skin(rgb(243, 238, 222), rgb(57, 255, 106), { AccentMaterial = Enum.Material.Neon }) },
	{ Id = "bike_retro", Name = "Retro", Category = "Bike", Price = 35000, Currency = "Coins", Rarity = Rarity.Epic, Art = "BikeRetro", Theme = "Retro8bit", Skin = skin(rgb(255, 0, 77), rgb(255, 236, 39)) },
	{ Id = "bike_ghost", Name = "Ghost", Category = "Bike", Price = 60000, Currency = "Coins", Rarity = Rarity.Legendary, Art = "BikeGhost", Theme = "Fantome", Skin = skin(rgb(31, 158, 116), rgb(157, 255, 203), { AccentMaterial = Enum.Material.Neon }) },
	{ Id = "bike_galaxy", Name = "Galaxy", Category = "Bike", Price = 499, Currency = "Robux", Rarity = Rarity.Legendary, Art = "BikeGalaxy", Theme = "Galaxie", Skin = skin(rgb(90, 31, 214), rgb(255, 79, 216), { AccentMaterial = Enum.Material.Neon }) },
}

--========================= TRAILS =========================--
-- `Theme` est le thème Blender joué par TrailsController.
local Trails: { Item } = {
	{ Id = "trail_keyboard", Name = "Keyboard", Category = "Trail", Price = 0, Currency = "Coins", Rarity = Rarity.Common, Art = "TrailGreen", Theme = "Clavier" },
	{ Id = "trail_lava", Name = "Lava", Category = "Trail", Price = 400, Currency = "Coins", Rarity = Rarity.Common, Art = "TrailRed", Theme = "Lave" },
	{ Id = "trail_ice", Name = "Ice", Category = "Trail", Price = 1800, Currency = "Coins", Rarity = Rarity.Rare, Art = "TrailBlue", Theme = "Glace" },
	{ Id = "trail_candy", Name = "Candy", Category = "Trail", Price = 5000, Currency = "Coins", Rarity = Rarity.Rare, Art = "TrailPurple", Theme = "BonbonGeant", LevelRequired = 12 },
	{ Id = "trail_robot", Name = "Robot", Category = "Trail", Price = 9000, Currency = "Coins", Rarity = Rarity.Rare, Art = "TrailBlue", Theme = "Robot" },
	{ Id = "trail_dragon", Name = "Dragon", Category = "Trail", Price = 15000, Currency = "Coins", Rarity = Rarity.Epic, Art = "TrailYellow", Theme = "Dragon" },
	{ Id = "trail_skeleton", Name = "Skeleton", Category = "Trail", Price = 22000, Currency = "Coins", Rarity = Rarity.Epic, Art = "TrailGreen", Theme = "Squelette" },
	{ Id = "trail_retro", Name = "Retro", Category = "Trail", Price = 30000, Currency = "Coins", Rarity = Rarity.Epic, Art = "TrailRed", Theme = "Retro8bit" },
	{ Id = "trail_ghost", Name = "Ghost", Category = "Trail", Price = 45000, Currency = "Coins", Rarity = Rarity.Legendary, Art = "TrailGreen", Theme = "Fantome" },
	{ Id = "trail_galaxy", Name = "Galaxy", Category = "Trail", Price = 399, Currency = "Robux", Rarity = Rarity.Legendary, Art = "TrailPurple", Theme = "Galaxie" },
}

--========================= AURAS =========================--
local Auras: { Item } = {
	{ Id = "aura_keyboard", Name = "Keyboard", Category = "Aura", Price = 0, Currency = "Coins", Rarity = Rarity.Common, Art = "AuraBlue", Theme = "Clavier" },
	{ Id = "aura_lava", Name = "Lava", Category = "Aura", Price = 1200, Currency = "Coins", Rarity = Rarity.Common, Art = "AuraGold", Theme = "Lave" },
	{ Id = "aura_ice", Name = "Ice", Category = "Aura", Price = 4000, Currency = "Coins", Rarity = Rarity.Rare, Art = "AuraBlue", Theme = "Glace" },
	{ Id = "aura_candy", Name = "Candy", Category = "Aura", Price = 7500, Currency = "Coins", Rarity = Rarity.Rare, Art = "AuraPurple", Theme = "BonbonGeant" },
	{ Id = "aura_robot", Name = "Robot", Category = "Aura", Price = 10000, Currency = "Coins", Rarity = Rarity.Rare, Art = "AuraBlue", Theme = "Robot" },
	{ Id = "aura_dragon", Name = "Dragon", Category = "Aura", Price = 12000, Currency = "Coins", Rarity = Rarity.Epic, Art = "AuraRed", Theme = "Dragon", LevelRequired = 22 },
	{ Id = "aura_skeleton", Name = "Skeleton", Category = "Aura", Price = 20000, Currency = "Coins", Rarity = Rarity.Epic, Art = "AuraGold", Theme = "Squelette" },
	{ Id = "aura_retro", Name = "Retro", Category = "Aura", Price = 28000, Currency = "Coins", Rarity = Rarity.Epic, Art = "AuraRed", Theme = "Retro8bit" },
	{ Id = "aura_ghost", Name = "Ghost", Category = "Aura", Price = 40000, Currency = "Coins", Rarity = Rarity.Legendary, Art = "AuraBlue", Theme = "Fantome" },
	{ Id = "aura_galaxy", Name = "Galaxy", Category = "Aura", Price = 449, Currency = "Robux", Rarity = Rarity.Legendary, Art = "AuraPurple", Theme = "Galaxie" },
}

--========================= PETS =========================--
-- Les seuls objets à stats. Ils ne s'achètent pas : ils sortent des œufs (EggService).
-- `Model` est la créature Blender posée dans Workspace.Pets_Oeufs_Roblox.
local function pet(id: string, name: string, rarity: string, model: string, speed: number, coins: number, xp: number): Item
	return { Id = id, Name = name, Category = "Pet", Price = 0, Currency = "Egg", Rarity = rarity, Model = model,
		Stats = { SpeedBonus = speed, CoinBonus = coins, XpBonus = xp } }
end
--[[
	Les quinze pets du jeu, trois œufs de cinq. `Model` est le nom du modèle 3D
	(copié dans ReplicatedStorage.BikeASMR.PetModels à la construction de la map :
	l'UI et le pet qui suit le vélo s'en servent sans dépendre du streaming).

	SpeedBonus multiplie la VITESSE GAGNÉE (voir ScoreService), CoinBonus les pièces.
]]
local Pets: { Item } = {
	{ Id = "pet_none", Name = "None", Category = "Pet", Price = 0, Currency = "Egg", Rarity = Rarity.Common, Stats = { SpeedBonus = 0, CoinBonus = 0, XpBonus = 0 } },
	-- Œuf clavier
	pet("pet_hamster", "Pedal Hamster", Rarity.Common, "Pet_HamsterPedaleur", 0.05, 0.05, 0),
	pet("pet_duck", "Helmet Duck", Rarity.Common, "Pet_CanardCasque", 0.08, 0.08, 0.05),
	pet("pet_cat8bit", "8-Bit Cat", Rarity.Rare, "Pet_Chat8Bit", 0.12, 0.12, 0.08),
	pet("pet_robodog", "Robo Doggo", Rarity.Epic, "Pet_RoboToutou", 0.2, 0.18, 0.12),
	pet("pet_enterking", "Enter King", Rarity.Legendary, "Pet_RoiEnter", 0.35, 0.3, 0.2),
	-- Œuf volcan de glace
	pet("pet_ember", "Embery", Rarity.Common, "Pet_Braisou", 0.25, 0.2, 0.1),
	pet("pet_penguin", "Ice Penguin", Rarity.Common, "Pet_PingouinGlacon", 0.32, 0.25, 0.12),
	pet("pet_golem", "Basalt Golem", Rarity.Rare, "Pet_GolemBasalte", 0.45, 0.35, 0.18),
	pet("pet_frostfox", "Frost Fox", Rarity.Epic, "Pet_RenardGivre", 0.65, 0.5, 0.25),
	pet("pet_babydragon", "Baby Dragon", Rarity.Legendary, "Pet_BebeDragon", 1.0, 0.75, 0.4),
	-- Œuf cosmique
	pet("pet_marshbear", "Marshmallow Bear", Rarity.Common, "Pet_OursonGuimauve", 0.8, 0.6, 0.3),
	pet("pet_skelcat", "Skeleton Cat", Rarity.Common, "Pet_ChatSquelette", 1.0, 0.75, 0.35),
	pet("pet_ghost", "Little Ghost", Rarity.Rare, "Pet_PetitFantome", 1.4, 1.0, 0.5),
	pet("pet_jelly", "Galactic Jelly", Rarity.Epic, "Pet_MeduseGalactique", 2.0, 1.5, 0.7),
	pet("pet_axolotl", "Saturn Axolotl", Rarity.Legendary, "Pet_AxolotlSaturne", 3.0, 2.2, 1.0),
}

--========================= EXPORT =========================--

local ShopConfig = {
	Rarity = Rarity,
	RarityColors = RarityColors,

	-- Ordre d'affichage des onglets de la boutique.
	Categories = table.freeze({ "Bike", "Trail", "Aura", "Pet" }),
	CategoryNames = table.freeze({
		Bike = "Bikes", Trail = "Trails", Aura = "Auras", Pet = "Pets",
	}),

	Items = table.freeze({ Bike = Bikes, Trail = Trails, Aura = Auras, Pet = Pets }),

	-- Équipement par défaut d'un nouveau joueur.
	Defaults = table.freeze({
		Bike = "bike_keyboard", Trail = "trail_keyboard", Aura = "aura_keyboard", Pet = "pet_none",
	}),
}

-- Index plat Id -> Item, construit une fois au require.
local byId: { [string]: Item } = {}
for _, list in ShopConfig.Items do
	for _, item in list do
		if byId[item.Id] then
			warn(("[ShopConfig] Id dupliqué : %s"):format(item.Id))
		end
		byId[item.Id] = item
	end
end

function ShopConfig.GetItem(id: string): Item?
	return byId[id]
end

-- Objets offerts d'office : ils ne doivent jamais apparaître comme à acheter.
function ShopConfig.IsDefault(id: string): boolean
	for _, defaultId in ShopConfig.Defaults do
		if defaultId == id then
			return true
		end
	end
	return false
end

-- Bonus cumulés apportés par l'équipement (aujourd'hui : le pet seul).
function ShopConfig.GetStats(equipped: { [string]: string })
	local stats = { SpeedBonus = 0, CoinBonus = 0, XpBonus = 0 }
	for _, itemId in equipped do
		local item = byId[itemId]
		if item and item.Stats then
			stats.SpeedBonus += item.Stats.SpeedBonus or 0
			stats.CoinBonus += item.Stats.CoinBonus or 0
			stats.XpBonus += item.Stats.XpBonus or 0
		end
	end
	return stats
end

return ShopConfig
