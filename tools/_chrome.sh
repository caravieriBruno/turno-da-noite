# Acha o Chrome/Edge (Windows/Git Bash, macOS, Linux) e um comando de tempo-limite.
# Uso: source "$(dirname "$0")/_chrome.sh"   → define BROWSER, TIMEOUT e CHROME_FLAGS
for B in "/c/Program Files/Google/Chrome/Application/chrome.exe" \
         "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
         "$(command -v google-chrome)" "$(command -v chromium)"; do
  [ -n "$B" ] && [ -x "$B" ] && BROWSER="$B" && break
done
[ -z "$BROWSER" ] && { echo "Chrome/Edge não encontrado"; exit 1; }
# o macOS não tem `timeout`: usa o gtimeout (coreutils) se existir; senão roda sem limite
TIMEOUT=""
command -v timeout >/dev/null && TIMEOUT="timeout 120"
[ -z "$TIMEOUT" ] && command -v gtimeout >/dev/null && TIMEOUT="gtimeout 120"
CHROME_FLAGS=(--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars)
