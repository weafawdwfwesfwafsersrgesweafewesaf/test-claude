--!strict
-- Réglages généraux du jeu. Tout l'équilibrage se fait ici.

local GameConfig = {}

-- Version de la sauvegarde : changer le nom réinitialise toutes les données.
GameConfig.DataStoreName = "LaunchForEggs_v1"

-- Lancer -----------------------------------------------------------------
-- Distance (studs) = BaseDistance + DistanceFactor * (puissance effective ^ DistanceExponent)
GameConfig.BaseDistance = 30
GameConfig.DistanceFactor = 8
GameConfig.DistanceExponent = 0.62
GameConfig.MaxDistance = 9400

-- Jauge de lancer : la précision va de MinAccuracy à MaxAccuracy.
-- Au-dessus de PerfectThreshold (jauge pleine), le lancer est "PARFAIT".
GameConfig.MinAccuracy = 0.5
GameConfig.MaxAccuracy = 1.5
GameConfig.PerfectThreshold = 0.92
GameConfig.PerfectBonus = 1.2

-- Durée du vol (secondes) = clamp(FlightBase + distance / FlightPerStud, FlightMin, FlightMax)
GameConfig.FlightBase = 1.4
GameConfig.FlightPerStud = 1300
GameConfig.FlightMin = 1.4
GameConfig.FlightMax = 6.5
-- Hauteur max de la trajectoire = distance * ApexRatio (bornée)
GameConfig.ApexRatio = 0.28
GameConfig.ApexMin = 18
GameConfig.ApexMax = 900

-- Temps avant d'être renvoyé sur le lanceur après l'atterrissage
GameConfig.ReturnDelay = 2.2
-- Délai minimum entre deux lancers (anti-spam)
GameConfig.LaunchCooldown = 0.6

-- Gains ------------------------------------------------------------------
-- La tendance "+1" : chaque lancer donne +1 Power (multiplié par pets/rebirth/gamepass)
GameConfig.PowerPerLaunch = 1
-- Cash gagné par stud parcouru
GameConfig.CashPerStud = 0.5

-- Rebirth ----------------------------------------------------------------
-- Coût en Power = RebirthBaseCost * (rebirths + 1) ^ RebirthCostExponent
GameConfig.RebirthBaseCost = 250
GameConfig.RebirthCostExponent = 1.6
-- Chaque rebirth ajoute ce bonus au multiplicateur de Power
GameConfig.RebirthBonus = 0.5

-- Pets -------------------------------------------------------------------
GameConfig.MaxEquippedPets = 3
GameConfig.MaxPetInventory = 120
-- Multiplicateur de chance du gamepass "Lucky" (sur les raretés Rare et plus)
GameConfig.LuckyMultiplier = 2

-- Sauvegarde -------------------------------------------------------------
GameConfig.AutoSaveInterval = 120

function GameConfig.GetDistance(effectivePower: number): number
	local d = GameConfig.BaseDistance + GameConfig.DistanceFactor * (math.max(effectivePower, 0) ^ GameConfig.DistanceExponent)
	return math.min(d, GameConfig.MaxDistance)
end

function GameConfig.GetFlightTime(distance: number): number
	return math.clamp(GameConfig.FlightBase + distance / GameConfig.FlightPerStud, GameConfig.FlightMin, GameConfig.FlightMax)
end

function GameConfig.GetApex(distance: number): number
	return math.clamp(distance * GameConfig.ApexRatio, GameConfig.ApexMin, GameConfig.ApexMax)
end

function GameConfig.GetRebirthCost(rebirths: number): number
	return math.floor(GameConfig.RebirthBaseCost * (rebirths + 1) ^ GameConfig.RebirthCostExponent)
end

function GameConfig.GetRebirthMultiplier(rebirths: number): number
	return 1 + rebirths * GameConfig.RebirthBonus
end

return GameConfig
