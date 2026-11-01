-- 参数：项目路径、Profile、已逐参数引用的启动命令、公共脚本。
on run argv
	set projectDir to item 1 of argv
	set profileName to item 2 of argv
	set helpers to run script (read (POSIX file (item 4 of argv)) as «class utf8»)
	set {targetWindow, targetTab} to my findProjectTarget(projectDir)
	set outcome to "reused"
	if targetTab is missing value then
		set targetWindow to helpers's findProfileWindow(profileName, true)
		set launchCommand to item 3 of argv
		tell application id "com.googlecode.iterm2"
			if targetWindow is missing value then
				set targetWindow to (create window with profile profileName command launchCommand)
				set targetTab to current tab of targetWindow
			else
				tell targetWindow
					set targetTab to (create tab with profile profileName command launchCommand)
				end tell
			end if
			tell current session of targetTab
				set variable named "user.agent_in_term_cwd" to projectDir
			end tell
		end tell
		set outcome to "created"
	end if
	helpers's focusTarget(targetWindow, targetTab)
	return outcome
end run

-- 固定标识不随内部 cd 改变；保留旧变量名以识别已有 tab。
on findProjectTarget(projectDir)
	tell application id "com.googlecode.iterm2"
		repeat with w in windows
			repeat with t in tabs of w
				repeat with s in sessions of t
					tell s
						if (variable named "user.agent_in_term_cwd") is projectDir then return {w, t}
					end tell
				end repeat
			end repeat
		end repeat
	end tell
	return {missing value, missing value}
end findProjectTarget
