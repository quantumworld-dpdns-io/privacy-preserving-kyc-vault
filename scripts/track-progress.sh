#!/bin/bash
echo "=== Privacy-Preserving KYC Vault Progress ==="
echo "Commits: $(git rev-list --count HEAD)"
echo "Files: $(find . -type f -not -path './.git/*' -not -path '*/node_modules/*' -not -path './target/*' -not -path './.venv/*' -not -path './__pycache__/*' -not -name '.DS_Store' | wc -l)"
echo "Directory size: $(du -sh . --exclude=.git 2>/dev/null | cut -f1)"
echo ""
echo "=== Recent Activity ==="
git log --oneline -5
echo ""
echo "=== Next Milestones ==="
CURRENT=$(git rev-list --count HEAD)
REMAINING=$((1000 - CURRENT))
if [ $REMAINING -gt 0 ]; then
  echo "Need $REMAINING more commits to reach 1000"
else
  echo "🎉 Successfully reached 1000+ commits!"
fi
