#!/bin/bash
SRC="/home/arun/.gemini/antigravity/brain/ef5cb532-6ce9-4892-b463-7466900e0bd2/media__1780758874559.jpg"
RES="android/app/src/main/res"

echo "Generating Android Mipmap Icons..."

# mipmap-mdpi (48x48 legacy, 108x108 foreground)
convert "$SRC" -resize 48x48 "$RES/mipmap-mdpi/ic_launcher.png"
convert "$SRC" -resize 48x48 "$RES/mipmap-mdpi/ic_launcher_round.png"
convert "$SRC" -resize 70x70 -background none -gravity center -extent 108x108 "$RES/mipmap-mdpi/ic_launcher_foreground.png"

# mipmap-hdpi (72x72 legacy, 162x162 foreground)
convert "$SRC" -resize 72x72 "$RES/mipmap-hdpi/ic_launcher.png"
convert "$SRC" -resize 72x72 "$RES/mipmap-hdpi/ic_launcher_round.png"
convert "$SRC" -resize 105x105 -background none -gravity center -extent 162x162 "$RES/mipmap-hdpi/ic_launcher_foreground.png"

# mipmap-xhdpi (96x96 legacy, 216x216 foreground)
convert "$SRC" -resize 96x96 "$RES/mipmap-xhdpi/ic_launcher.png"
convert "$SRC" -resize 96x96 "$RES/mipmap-xhdpi/ic_launcher_round.png"
convert "$SRC" -resize 140x140 -background none -gravity center -extent 216x216 "$RES/mipmap-xhdpi/ic_launcher_foreground.png"

# mipmap-xxhdpi (144x144 legacy, 324x324 foreground)
convert "$SRC" -resize 144x144 "$RES/mipmap-xxhdpi/ic_launcher.png"
convert "$SRC" -resize 144x144 "$RES/mipmap-xxhdpi/ic_launcher_round.png"
convert "$SRC" -resize 210x210 -background none -gravity center -extent 324x324 "$RES/mipmap-xxhdpi/ic_launcher_foreground.png"

# mipmap-xxxhdpi (192x192 legacy, 432x432 foreground)
convert "$SRC" -resize 192x192 "$RES/mipmap-xxxhdpi/ic_launcher.png"
convert "$SRC" -resize 192x192 "$RES/mipmap-xxxhdpi/ic_launcher_round.png"
convert "$SRC" -resize 280x280 -background none -gravity center -extent 432x432 "$RES/mipmap-xxxhdpi/ic_launcher_foreground.png"

echo "Generating Web Icons & Favicon..."
convert "$SRC" -resize 32x32 public/favicon.png
convert "$SRC" -resize 512x512 public/icon.png

echo "All icons successfully created!"
