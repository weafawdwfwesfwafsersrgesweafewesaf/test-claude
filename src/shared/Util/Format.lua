--!strict
-- Formatage des nombres et du temps pour l'UI.

local Format = {}

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc" }

-- 1234 -> "1.23K", 15300000 -> "15.3M"
function Format.Short(n: number): string
	if n ~= n then
		return "0"
	end
	local negative = n < 0
	n = math.abs(n)
	if n < 1000 then
		local s = if n % 1 == 0 then tostring(math.floor(n)) else string.format("%.1f", n)
		return (if negative then "-" else "") .. s
	end
	local index = math.min(math.floor(math.log10(n) / 3), #SUFFIXES - 1)
	local value = n / (1000 ^ index)
	local text
	if value >= 100 then
		text = string.format("%d", math.floor(value))
	elseif value >= 10 then
		text = string.format("%.1f", math.floor(value * 10) / 10)
	else
		text = string.format("%.2f", math.floor(value * 100) / 100)
	end
	text = text:gsub("%.?0+$", "")
	return (if negative then "-" else "") .. text .. SUFFIXES[index + 1]
end

-- 1234567 -> "1,234,567"
function Format.Commas(n: number): string
	local s = tostring(math.floor(n))
	local formatted = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	return (formatted:gsub("^,", ""))
end

-- Multiplicateur : 1.5 -> "x1.5"
function Format.Mult(n: number): string
	if n >= 1000 then
		return "x" .. Format.Short(n)
	end
	local text = string.format("%.2f", n):gsub("%.?0+$", "")
	return "x" .. text
end

-- Pourcentage de chance : 0.1 -> "0.1%", 40 -> "40%"
function Format.Chance(percent: number): string
	if percent >= 10 then
		return string.format("%d%%", math.floor(percent + 0.5))
	end
	local text = string.format("%.2f", percent):gsub("%.?0+$", "")
	return text .. "%"
end

-- 1395231 -> "16d 3h 13m 51s"
function Format.Countdown(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	local d = math.floor(seconds / 86400)
	local h = math.floor(seconds % 86400 / 3600)
	local m = math.floor(seconds % 3600 / 60)
	local s = seconds % 60
	if d > 0 then
		return string.format("%dd %dh %dm %ds", d, h, m, s)
	elseif h > 0 then
		return string.format("%dh %dm %ds", h, m, s)
	end
	return string.format("%dm %ds", m, s)
end

return Format
