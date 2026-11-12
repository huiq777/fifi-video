#!/bin/bash
# Full-quality build: score -> picture segments (ProRes) -> one delivery encode with sound.
#   tools/make.sh            render whatever segments are missing, then assemble
#   tools/make.sh 48_58      re-render that segment first        (or: all)
#   W=3840 H=2160 tools/make.sh   for a 4K master
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
FORCE=${1:-$FORCE}
W=${W:-1920}; H=${H:-1080}; FPS=${FPS:-60}; SAMPLES=${SAMPLES:-8}
SEG="$ROOT/out/seg/final_${H}"; mkdir -p "$SEG" out/audio
OUT="$ROOT/out/第一次日出_FIRST_LIGHT_${H}p${FPS}.mp4"

node tools/events.mjs > audio/events.json
python3 audio/score.py > out/audio/score.log 2>&1 || { tail -5 out/audio/score.log; exit 1; }

SEGS=("0 20" "20 36" "36 48" "48 58" "58 64" "64 68" "68 86" "86 106")
for s in "${SEGS[@]}"; do
  set -- $s
  f="$SEG/seg_$(printf '%03d' $1)_$(printf '%03d' $2).mov"
  if [ "$FORCE" = "${1}_${2}" ] || [ "$FORCE" = "all" ]; then rm -f "$f"; fi
  if [ ! -f "$f" ]; then
    echo "== rendering $1–$2 s  $(date +%H:%M:%S)"
    node render.mjs video --from $1 --to $2 --w $W --h $H --fps $FPS --samples $SAMPLES --out "$SEG/tmp.mov" | grep frames | tail -1
    mv "$SEG/tmp.mov" "$f"
  fi
done
: > "$SEG/list.txt"
for f in "$SEG"/seg_*.mov; do echo "file '$f'" >> "$SEG/list.txt"; done
echo "== encoding  $(date +%H:%M:%S)"
# sRGB transfer tag so QuickTime shows the same picture as a browser; everything else assumes Rec.709 anyway
enc() { # $1 = crf, $2 = output
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$SEG/list.txt" -i out/audio/first_light.wav -map 0:v -map 1:a \
    -vf "setparams=range=tv:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709,format=yuv420p" \
    -c:v libx264 -preset slow -crf $1 -tune film -profile:v high -g 120 -bf 2 \
    -x264-params colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709:aq-mode=3 \
    -c:a aac -b:a 320k -shortest -movflags +faststart "$2"
  echo "wrote $2  $(date +%H:%M:%S)"
  ffprobe -v error -show_entries format=duration,size,bit_rate -of default=nw=1 "$2" | tr '\n' ' '; echo
}
enc ${CRF:-18} "$OUT"
[ -n "$NOLIGHT" ] || enc 21 "${OUT%.mp4}_轻量.mp4"
