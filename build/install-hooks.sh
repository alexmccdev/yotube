#!/bin/sh
# Run once to enable the post-commit auto-rebuild/reinstall hook
# (.git/hooks isn't tracked by git, so this wires it up locally).
set -e
cd "$(dirname "$0")/.."

cat > .git/hooks/post-commit <<'EOF'
#!/bin/sh
# Runs in the background so `git commit` isn't blocked on a full rebuild.
# Check build/post-commit-install.log if /Applications/Yotube.app doesn't
# seem to have picked up your latest commit.
ROOT="$(git rev-parse --show-toplevel)"
nohup "$ROOT/build/post-commit-install.sh" > "$ROOT/build/post-commit-install.log" 2>&1 &
disown
EOF
chmod +x .git/hooks/post-commit
echo "Installed .git/hooks/post-commit — every commit will rebuild and reinstall Yotube.app in the background."
