#!/bin/sh
# Homebrew's python@3.14 pyexpat is linked against a libexpat ABI newer than
# macOS's system /usr/lib/libexpat.1.dylib provides, so plain `python3` dies
# with a dlopen symbol error before dmg-builder's vendored dmgbuild/core.py
# can run. Point it at brew's (keg-only) expat instead.
export DYLD_LIBRARY_PATH="/opt/homebrew/opt/expat/lib:$DYLD_LIBRARY_PATH"
exec python3 "$@"
