-- 两种模式共享窗口定位和焦点收尾；项目 tab 的识别规则由各模式负责。
script ItermHelpers
	-- 原生模式只检查当前 session；Herdr 保留旧入口遍历所有 pane 的规则。
	on findProfileWindow(profileName, inspectAllSessions)
		tell application id "com.googlecode.iterm2"
			repeat with w in windows
				repeat with t in tabs of w
					set candidates to {current session of t}
					if inspectAllSessions then set candidates to sessions of t
					repeat with candidate in candidates
						tell candidate
							if profile name is profileName then return w
						end tell
					end repeat
				end repeat
			end repeat
		end tell
		return missing value
	end findProfileWindow

	on focusTarget(targetWindow, targetTab)
		tell application id "com.googlecode.iterm2"
			select targetWindow
			select targetTab
			activate
		end tell
	end focusTarget
end script
return ItermHelpers
