-- 两种模式共享窗口定位和焦点收尾；项目 tab 的识别规则由各模式负责。
script ItermHelpers
	on findProfileWindow(profileName)
		tell application "iTerm2"
			repeat with w in windows
				repeat with t in tabs of w
					tell current session of t
						if profile name is profileName then return w
					end tell
				end repeat
			end repeat
		end tell
		return missing value
	end findProfileWindow

	on focusTarget(targetWindow, targetTab)
		tell application "iTerm2"
			select targetWindow
			select targetTab
			activate
		end tell
	end focusTarget
end script
return ItermHelpers
