class Iterm2Launcher < Formula
  desc "Launch project workspaces in iTerm2 using native panes or Herdr"
  homepage "https://github.com/yungyu16/iterm2-launcher"
  url "https://github.com/yungyu16/iterm2-launcher/releases/download/v0.1.0/iterm2-launcher-0.1.0.tar.gz"
  sha256 "0c2facd5cbc1d00284d61e5b9ec86a53c41f1dab63231524f37ac676a1792671"
  license "MIT"

  depends_on :macos

  def install
    libexec.install "dist", "scripts", "node_modules", "package.json"
    (bin/"iterm2-launch").write <<~SH
      #!/bin/sh
      command -v node >/dev/null 2>&1 || { echo "Node.js 24 is required on PATH (nvm or mise supported)." >&2; exit 1; }
      exec node "#{libexec}/dist/bin/iterm2-launch.js" "$@"
    SH
    pkgshare.install "examples/config.toml"
  end

  def caveats
    <<~EOS
      Requires Node.js 24 on PATH, iTerm2 and an existing Profile (default: Default).
      Example config: #{pkgshare}/config.toml
      Copy it to $XDG_CONFIG_HOME/iterm2-launcher/config.toml
      (default: ~/.config/iterm2-launcher/config.toml) and edit commands.
      Herdr mode additionally requires herdr on PATH.
      Installation does not change user configuration or shell startup files.
    EOS
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/iterm2-launch --version").strip
    assert_match "native|herdr", shell_output("#{bin}/iterm2-launch --help")
    (testpath/"invalid.toml").write("[native]\ncommands = []\n")
    assert_match "native", shell_output("#{bin}/iterm2-launch native --config #{testpath}/invalid.toml 2>&1", 1)
  end
end
