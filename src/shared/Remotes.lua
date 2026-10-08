--!strict
-- Tous les RemoteEvents / RemoteFunctions du jeu, créés par le serveur et attendus par le client.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local EVENTS = {
	"Launch", -- client -> serveur (précision de la jauge)
	"LaunchStarted", -- serveur -> client (trajectoire)
	"Landed", -- serveur -> client (résultat du lancer)
	"DataChanged", -- serveur -> client (données du joueur)
	"Hatched", -- serveur -> client (œufs Robux ouverts)
	"Notify", -- serveur -> client (message)
	"Announce", -- serveur -> tous (pet rare obtenu)
	"EquipPet",
	"EquipBest",
	"DeletePets",
	"BuyLauncher",
	"EquipLauncher",
	"Rebirth",
	"StudioPurchase", -- achats simulés dans Studio quand l'ID vaut 0
}

local FUNCTIONS = {
	"GetData",
}

local Remotes = {}

local folder: Folder
if RunService:IsServer() then
	folder = Instance.new("Folder")
	folder.Name = "Remotes"
	for _, name in EVENTS do
		local remote = Instance.new("RemoteEvent")
		remote.Name = name
		remote.Parent = folder
	end
	for _, name in FUNCTIONS do
		local remote = Instance.new("RemoteFunction")
		remote.Name = name
		remote.Parent = folder
	end
	folder.Parent = ReplicatedStorage
else
	folder = ReplicatedStorage:WaitForChild("Remotes") :: Folder
end

function Remotes.Event(name: string): RemoteEvent
	return folder:WaitForChild(name) :: RemoteEvent
end

function Remotes.Function(name: string): RemoteFunction
	return folder:WaitForChild(name) :: RemoteFunction
end

return Remotes
