-- 参数：项目路径、Profile、四个命令（空值跳过）、公共脚本路径。
on run argv
	set projectDir to item 1 of argv
	set profileName to item 2 of argv
	set helpers to run script (read (POSIX file (item 7 of argv)) as «class utf8»)
	set commands to {}
	repeat with commandText in items 3 thru 6 of argv
		if (contents of commandText) is not "" then set end of commands to contents of commandText
	end repeat
	if (count of commands) is 0 then error "至少需要一个面板命令"

	set targetWindow to helpers's findProfileWindow(profileName)
	set targetTab to missing value
	tell application "iTerm2"
		if targetWindow is missing value then
			set targetWindow to (create window with profile profileName)
			set targetTab to current tab of targetWindow
		else
			set targetTab to my findProjectTab(targetWindow, projectDir)
			if targetTab is not missing value then
				helpers's focusTarget(targetWindow, targetTab)
				return "reused"
			end if
			tell targetWindow
				set targetTab to (create tab with profile profileName)
			end tell
		end if
	end tell
	my initializePanels(targetTab, profileName, projectDir, commands)
	helpers's focusTarget(targetWindow, targetTab)
	return "created"
end run

-- 原生模式保留按当前 session.path 复用的既有语义。
on findProjectTab(targetWindow, projectDir)
	tell application "iTerm2"
		repeat with t in tabs of targetWindow
			tell current session of t
				if (variable named "session.path") is projectDir then return t
			end tell
		end repeat
	end tell
	return missing value
end findProjectTab

on initializePanels(targetTab, profileName, projectDir, commands)
	set panelCount to count of commands
	tell application "iTerm2"
		set firstSession to current session of targetTab
		set panelSessions to {firstSession}
		if panelCount is 4 then
			-- 四宫格按左上、右上、左下、右下排列。
			tell firstSession
				set bottomLeft to (split horizontally with profile profileName)
				set topRight to (split vertically with profile profileName)
			end tell
			tell bottomLeft
				set bottomRight to (split vertically with profile profileName)
			end tell
			set panelSessions to {firstSession, topRight, bottomLeft, bottomRight}
		else if panelCount is greater than 1 then
			tell firstSession
				set rightSession to (split vertically with profile profileName)
			end tell
			set end of panelSessions to rightSession
			if panelCount is 3 then
				tell rightSession
					set bottomRight to (split horizontally with profile profileName)
				end tell
				set end of panelSessions to bottomRight
			end if
		end if

		repeat with panelIndex from 1 to panelCount
			set panelCommand to item panelIndex of commands
			set panelSession to item panelIndex of panelSessions
			tell panelSession
				write text "cd " & quoted form of projectDir & " && clear"
				delay 0.3
				write text panelCommand
			end tell
		end repeat
	end tell
end initializePanels
