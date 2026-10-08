--!strict
-- Calculs partagés serveur/client : multiplicateur des pets, chances des œufs.

local Config = script.Parent.Parent.Config
local Pets = require(Config.Pets)
local Eggs = require(Config.Eggs)
local Rarities = require(Config.Rarities)
local GameConfig = require(Config.GameConfig)

local PetMath = {}

export type OwnedPet = { Uid: string, Id: string }

-- Multiplicateur total des pets équipés : 1 + somme des (multiplicateur - 1)
function PetMath.GetEquippedMultiplier(pets: { OwnedPet }, equipped: { string }): number
	local lookup = {}
	for _, uid in equipped do
		lookup[uid] = true
	end
	local total = 1
	for _, owned in pets do
		if lookup[owned.Uid] then
			local def = Pets[owned.Id]
			if def then
				total += def.Multiplier - 1
			end
		end
	end
	return total
end

-- Retourne la liste des pets d'un œuf avec leur chance en % (somme = 100)
function PetMath.GetChances(eggId: string, lucky: boolean): { { Pet: string, Chance: number } }
	local egg = Eggs[eggId]
	local result = {}
	if not egg then
		return result
	end
	local total = 0
	local weights = {}
	for i, entry in egg.Pets do
		local weight = entry.Weight
		local def = Pets[entry.Pet]
		if lucky and def and Rarities[def.Rarity].Lucky then
			weight *= GameConfig.LuckyMultiplier
		end
		weights[i] = weight
		total += weight
	end
	for i, entry in egg.Pets do
		table.insert(result, { Pet = entry.Pet, Chance = weights[i] / total * 100 })
	end
	return result
end

-- Tirage aléatoire (à appeler côté serveur uniquement)
function PetMath.Roll(eggId: string, lucky: boolean, rng: Random): string?
	local chances = PetMath.GetChances(eggId, lucky)
	local roll = rng:NextNumber() * 100
	local acc = 0
	for _, entry in chances do
		acc += entry.Chance
		if roll <= acc then
			return entry.Pet
		end
	end
	local last = chances[#chances]
	return if last then last.Pet else nil
end

-- Trie des uids de pets du meilleur au moins bon
function PetMath.SortBest(pets: { OwnedPet }): { OwnedPet }
	local sorted = table.clone(pets)
	table.sort(sorted, function(a, b)
		local pa, pb = Pets[a.Id], Pets[b.Id]
		local ma = if pa then pa.Multiplier else 0
		local mb = if pb then pb.Multiplier else 0
		if ma == mb then
			return a.Uid < b.Uid
		end
		return ma > mb
	end)
	return sorted
end

return PetMath
