#!/usr/bin/env bash
# Sofascore blocks plain HTTP clients, so the stats are fetched from inside a headless browser page.
set -euo pipefail
out="${1:-data/sofascore-stats.json}"
agent-browser open https://www.sofascore.com/ >/dev/null
agent-browser eval '(async()=>{const L={A:[325,87678],B:[390,89840],C:[1281,90642],D:[10326,92447]};const F="minutesPlayed,appearances,rating,goals,assists,tackles,interceptions,keyPasses,accuratePassesPercentage,expectedGoals,totalDuelsWonPercentage,saves";const rows=[];for(const [k,[t,s]] of Object.entries(L)){for(let o=0;;o+=100){const r=await fetch(`/api/v1/unique-tournament/${t}/season/${s}/statistics?limit=100&offset=${o}&order=-minutesPlayed&accumulation=total&fields=${F}`);if(!r.ok)throw new Error(`${k} ${r.status}`);const j=await r.json();for(const x of j.results){const{player,team,...st}=x;rows.push({div:k,id:player.id,name:player.name,team:team&&team.name,...st});}if(o/100+1>=j.pages)break;}}return JSON.stringify(rows)})()' \
  | tail -1 | python3 -c "import json,sys; open(sys.argv[1],'w').write(json.loads(sys.stdin.read()))" "$out"
agent-browser close >/dev/null
