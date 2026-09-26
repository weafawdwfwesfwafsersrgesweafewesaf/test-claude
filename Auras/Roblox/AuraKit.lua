--!strict
--[[
	AuraKit — les thèmes de couleur des auras.

	L'aura est désormais une aura « chakra » en particules, construite par
	AurasController autour du pilote. Les anciens maillages (anneau + spirale) ne
	sont plus utilisés : Construire ne rend plus de modèle, et l'inventaire affiche
	l'icône de l'aura à la place (voir UIController.Inventory).

	anneau : couleur du bord de la flamme et du contour ; spirale : cœur de la
	flamme et étincelles ; lueur : voile et lumière ; souffle : rythme (conservé).
]]

local AuraKit = {}

AuraKit.STUDS_PAR_UNITE = 1.25

AuraKit.Themes = {
	Clavier = { anneau = "3a6bff", spirale = "2aff7a", lueur = "5a8cff", souffle = 1.6 },
	Lave = { anneau = "ff3a00", spirale = "ffb000", lueur = "ff6a00", souffle = 2.2 },
	Glace = { anneau = "4fd1ff", spirale = "bff2ff", lueur = "9fe8ff", souffle = 1.2 },
	Dragon = { anneau = "ff5a00", spirale = "ffd21a", lueur = "ffb000", souffle = 2.0 },
	Galaxie = { anneau = "8a3dff", spirale = "ff4fd8", lueur = "b06bff", souffle = 1.4 },
	Squelette = { anneau = "39ff6a", spirale = "e9e2cf", lueur = "6affa0", souffle = 1.3 },
	Retro8bit = { anneau = "ff004d", spirale = "ffec27", lueur = "ffec27", souffle = 2.6 },
	Robot = { anneau = "35e8ff", spirale = "ff8c1a", lueur = "7ff0ff", souffle = 1.8 },
	BonbonGeant = { anneau = "ff6fb0", spirale = "ffd84a", lueur = "ffa8d4", souffle = 1.5 },
	Fantome = { anneau = "9dffcb", spirale = "ffffff", lueur = "c8ffe4", souffle = 0.9 },
}
AuraKit.THEME_DEFAUT = "Clavier"

function AuraKit.Theme(nom: string?): any
	return AuraKit.Themes[nom or ""] or AuraKit.Themes[AuraKit.THEME_DEFAUT]
end

-- Plus de maillages : conservées pour les anciens appels (l'inventaire montre l'icône).
function AuraKit.Modeles(): nil
	return nil
end

function AuraKit.Teindre(_mp: BasePart, _couleur: Color3, _eclat: number?) end

function AuraKit.Construire(_nomTheme: string?, _echelle: number): (Model?, { [BasePart]: CFrame })
	return nil, {}
end

return AuraKit
