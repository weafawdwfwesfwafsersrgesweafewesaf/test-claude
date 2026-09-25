--!strict
--[[
	ProgressionConfig — les deux axes de progression du jeu.

	1. VITESSE (la stat vedette, celle du titre "+1 Bike Speed")
	   Chaque touche percutée = +1 point. Le point se convertit en studs/s et se
	   voit immédiatement au pilotage. C'est aussi elle qui verrouille les niveaux.

	2. NIVEAU / XP
	   Plus lent, sert à débloquer les cosmétiques de la boutique.

	Les deux sont volontairement séparés : le joueur qui farme la vitesse avance
	vite dans la map, celui qui joue longtemps débloque le catalogue.
]]

local GameConfig = require(script.Parent.GameConfig)

local ProgressionConfig = {
	--========================= VITESSE =========================--
	SpeedPerKey = 1,        -- le "+1" du titre
	SpeedPerSpecial = 5,    -- touches larges (ESPACE, ENTRÉE…)
	SpeedPerBoostKey = 2,
	--[[
		Plafond réel en studs/s, et rapidité avec laquelle on s'en approche.

		La conversion était linéaire et le plafond à 235 : les seuls trophées d'un
		parcours complet rapportent 1675 points, soit +536 studs/s. On touchait donc
		le plafond dès la première travée — et 235 studs/s est de toute façon
		inpilotable dans un couloir large de 86 studs.

		La courbe est désormais asymptotique : les premiers points se sentent
		énormément, les suivants de moins en moins, et la somme ne franchit jamais
		le plafond. `SpeedCurveStat` est la stat à laquelle 63 % de l'écart est comblé.

		La stat AFFICHÉE, elle, continue de monter sans limite : c'est le nombre que
		le joueur collectionne, seule sa traduction en studs/s est bridée.
	]]
	SpeedCap = 105,
	--[[
		ÉQUILIBRAGE (durée de vie ~4 h pour finir les 12 niveaux) : les portes de
		vitesse ont été multipliées pour que les rebirths deviennent nécessaires.
		La courbe suit (420 -> 2500) : la vitesse réelle en studs/s à l'entrée des
		premiers niveaux reste proche de celle pour laquelle ils ont été dessinés.
	]]
	SpeedCurveStat = 2500,

	--========================= NIVEAU / XP =========================--
	MaxLevel = 100,
	XpPerKey = 3,
	XpPerSpecial = 25,
	XpPerStud = 0.02,
	XpPerCombo = 1,
	CoinsPerLevelUp = 50,
}

--[[
	Récompenses de trophée, par index de niveau. Le saut de vitesse est volontairement
	gros : terminer un niveau doit se sentir plus qu'un run de farm.

	IL EN FAUT AUTANT QUE DE NIVEAUX. La table en comptait huit pour neuf niveaux,
	puis douze : `TrophyRewards[levelIndex]` rendait nil et le trophée du dernier
	niveau ne payait RIEN — silencieusement, puisqu'un index manquant ne se plaint
	pas. La vérification en fin de fichier ferme la porte pour de bon.

	La progression suit celle des portes de vitesse : chaque trophée rapporte à peu
	près de quoi ouvrir la porte suivante en une poignée de parcours, jamais d'un
	seul. C'est la boucle du jeu : on gagne un niveau, on farme un peu, on ouvre.

	ÉQUILIBRAGE : la vitesse du trophée vaut ~25 % de la porte suivante (le coup de
	boost se sent), et les pièces du 1er passage paient à peu près un vélo du palier
	atteint. Le 12 paie de quoi s'offrir le vélo Ghost : c'est la récompense finale.
]]
ProgressionConfig.TrophyRewards = table.freeze({
	table.freeze({ Coins = 100, Xp = 200, Speed = 25, Trophies = 1 }),
	table.freeze({ Coins = 250, Xp = 500, Speed = 75, Trophies = 2 }),
	table.freeze({ Coins = 600, Xp = 1000, Speed = 200, Trophies = 3 }),
	table.freeze({ Coins = 1500, Xp = 2000, Speed = 600, Trophies = 5 }),
	table.freeze({ Coins = 3500, Xp = 3500, Speed = 1800, Trophies = 8 }),
	table.freeze({ Coins = 8000, Xp = 6000, Speed = 5000, Trophies = 12 }),
	table.freeze({ Coins = 18000, Xp = 10000, Speed = 15000, Trophies = 18 }),
	table.freeze({ Coins = 40000, Xp = 18000, Speed = 40000, Trophies = 25 }),
	table.freeze({ Coins = 80000, Xp = 30000, Speed = 110000, Trophies = 35 }),
	table.freeze({ Coins = 160000, Xp = 50000, Speed = 300000, Trophies = 50 }),
	table.freeze({ Coins = 350000, Xp = 85000, Speed = 800000, Trophies = 70 }),
	table.freeze({ Coins = 750000, Xp = 140000, Speed = 2000000, Trophies = 100 }),
})

-- Une pièce tous les N touches : la monnaie doit tomber régulièrement sans
-- concurrencer la vitesse, qui reste la stat vedette.
ProgressionConfig.KeysPerCoin = 6
ProgressionConfig.CoinsPerDrop = 5

-- Récompense réduite quand le trophée a déjà été pris : on encourage le rejeu
-- sans rendre le farm du dernier niveau trivialement optimal.
ProgressionConfig.RepeatTrophyRatio = 0.25

--========================= VITESSE =========================--

--[[
	Convertit la stat de vitesse en studs/s réels.
	`bonus` est le SpeedBonus cumulé de l'équipement (ex. 0.14 pour +14%).
]]
function ProgressionConfig.SpeedFromStat(speedStat: number, bonus: number?): number
	local bike = GameConfig.Bike
	local cap = ProgressionConfig.SpeedCap
	local span = cap - bike.BaseSpeed

	-- Approche exponentielle du plafond : chaque point rapporte un peu moins que
	-- le précédent, et la somme ne peut pas le franchir.
	local progress = 1 - math.exp(-math.max(0, speedStat) / ProgressionConfig.SpeedCurveStat)
	local raw = bike.BaseSpeed + span * progress
	raw *= 1 + (bonus or 0)
	return math.clamp(raw, bike.BaseSpeed, cap)
end

-- Stat de vitesse nécessaire pour entrer dans un niveau.
function ProgressionConfig.MeetsSpeedGate(speedStat: number, required: number): boolean
	return speedStat >= required
end

--========================= XP =========================--

-- XP nécessaire pour passer de `level` à `level + 1`.
function ProgressionConfig.XpForNextLevel(level: number): number
	if level >= ProgressionConfig.MaxLevel then
		return math.huge
	end
	return math.floor(70 * level ^ 1.45 + 30 * level + 60)
end

--[[
	Applique l'XP gagnée. Fonction pure : le client peut la réutiliser pour
	prédire l'affichage sans attendre la réponse du serveur.
	Retourne : niveau, xp restante, nombre de niveaux gagnés.
]]
function ProgressionConfig.ApplyXp(level: number, xp: number, gained: number)
	level = math.clamp(level, 1, ProgressionConfig.MaxLevel)
	xp += math.max(0, gained)
	local levelsGained = 0

	while level < ProgressionConfig.MaxLevel do
		local needed = ProgressionConfig.XpForNextLevel(level)
		if xp < needed then
			break
		end
		xp -= needed
		level += 1
		levelsGained += 1
	end

	if level >= ProgressionConfig.MaxLevel then
		xp = 0
	end

	return level, xp, levelsGained
end

--[[
	Un trophée sans récompense ne se voit pas : `TrophyRewards[index]` rend nil, le
	service passe son chemin, et le joueur termine le niveau le plus dur du jeu pour
	rien. On refuse donc de démarrer plutôt que de payer zéro en silence.
]]
do
	local MapConfig = require(script.Parent.MapConfig)
	local manque = #MapConfig.Levels - #ProgressionConfig.TrophyRewards
	if manque > 0 then
		error(("[ProgressionConfig] %d niveau(x) sans récompense de trophée : "
			.. "TrophyRewards en compte %d pour %d niveaux")
			:format(manque, #ProgressionConfig.TrophyRewards, #MapConfig.Levels))
	end
end

return ProgressionConfig
