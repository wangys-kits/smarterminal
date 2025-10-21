#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$ROOT_DIR/exports"
SYMBOL="$ROOT_DIR/symbol.svg"
TILE_DARK="$ROOT_DIR/tile-dark.svg"
TILE_LIGHT="$ROOT_DIR/tile-light.svg"
MARK="$ROOT_DIR/mark.svg"

# Choose renderer: rsvg-convert > magick
render_svg() {
  local in_svg="$1"; shift
  local size="$1"; shift
  local out_png="$1"; shift
  local bg="${1:-}" || true

  mkdir -p "$(dirname "$out_png")"
  if command -v rsvg-convert >/dev/null 2>&1; then
    # rsvg-convert does not support background; use as-is
    rsvg-convert -w "$size" -h "$size" "$in_svg" -o "$out_png"
  elif command -v magick >/dev/null 2>&1; then
    if [ -n "$bg" ]; then
      magick -background "$bg" -size ${size}x${size} "$in_svg" -resize ${size}x${size} png32:"$out_png"
    else
      magick -size ${size}x${size} "$in_svg" -resize ${size}x${size} png32:"$out_png"
    fi
  elif command -v convert >/dev/null 2>&1; then
    if [ -n "$bg" ]; then
      convert -background "$bg" -size ${size}x${size} "$in_svg" -resize ${size}x${size} png32:"$out_png"
    else
      convert -size ${size}x${size} "$in_svg" -resize ${size}x${size} png32:"$out_png"
    fi
  else
    echo "No SVG renderer found (need rsvg-convert or ImageMagick)." >&2
    exit 1
  fi
}

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Choose tile by background preference (dark|light)
BG_MODE="${BG:-dark}"
if [ "$BG_MODE" = "light" ]; then
  TILE_USE="$TILE_LIGHT"
else
  TILE_USE="$TILE_DARK"
fi

# 1) iOS AppIcon.appiconset
IOS_DIR="$OUT_DIR/ios/AppIcon.appiconset"
mkdir -p "$IOS_DIR"

IOS_LIST=(
  # iPhone
  "iphone-notification-2x:40" "iphone-notification-3x:60"
  "iphone-settings-2x:58"    "iphone-settings-3x:87"
  "iphone-spotlight-2x:80"   "iphone-spotlight-3x:120"
  "iphone-app-2x:120"        "iphone-app-3x:180"
  # iPad
  "ipad-notification-1x:20"  "ipad-notification-2x:40"
  "ipad-settings-1x:29"      "ipad-settings-2x:58"
  "ipad-spotlight-1x:40"     "ipad-spotlight-2x:80"
  "ipad-app-1x:76"           "ipad-app-2x:152"
  "ipad-pro-app-2x:167"
  # App Store
  "app-store-1024:1024"
)

for entry in "${IOS_LIST[@]}"; do
  IFS=":" read -r name size <<< "$entry"
  render_svg "$TILE_USE" "$size" "$IOS_DIR/icon-$name.png"
done

# Create minimal Contents.json
cat > "$IOS_DIR/Contents.json" << 'JSON'
{
  "images": [
    {"idiom": "iphone", "size": "20x20", "scale": "2x", "filename": "icon-iphone-notification-2x.png"},
    {"idiom": "iphone", "size": "20x20", "scale": "3x", "filename": "icon-iphone-notification-3x.png"},
    {"idiom": "iphone", "size": "29x29", "scale": "2x", "filename": "icon-iphone-settings-2x.png"},
    {"idiom": "iphone", "size": "29x29", "scale": "3x", "filename": "icon-iphone-settings-3x.png"},
    {"idiom": "iphone", "size": "40x40", "scale": "2x", "filename": "icon-iphone-spotlight-2x.png"},
    {"idiom": "iphone", "size": "40x40", "scale": "3x", "filename": "icon-iphone-spotlight-3x.png"},
    {"idiom": "iphone", "size": "60x60", "scale": "2x", "filename": "icon-iphone-app-2x.png"},
    {"idiom": "iphone", "size": "60x60", "scale": "3x", "filename": "icon-iphone-app-3x.png"},

    {"idiom": "ipad", "size": "20x20", "scale": "1x", "filename": "icon-ipad-notification-1x.png"},
    {"idiom": "ipad", "size": "20x20", "scale": "2x", "filename": "icon-ipad-notification-2x.png"},
    {"idiom": "ipad", "size": "29x29", "scale": "1x", "filename": "icon-ipad-settings-1x.png"},
    {"idiom": "ipad", "size": "29x29", "scale": "2x", "filename": "icon-ipad-settings-2x.png"},
    {"idiom": "ipad", "size": "40x40", "scale": "1x", "filename": "icon-ipad-spotlight-1x.png"},
    {"idiom": "ipad", "size": "40x40", "scale": "2x", "filename": "icon-ipad-spotlight-2x.png"},
    {"idiom": "ipad", "size": "76x76", "scale": "1x", "filename": "icon-ipad-app-1x.png"},
    {"idiom": "ipad", "size": "76x76", "scale": "2x", "filename": "icon-ipad-app-2x.png"},
    {"idiom": "ipad", "size": "83.5x83.5", "scale": "2x", "filename": "icon-ipad-pro-app-2x.png"},

    {"idiom": "ios-marketing", "size": "1024x1024", "scale": "1x", "filename": "icon-app-store-1024.png"}
  ],
  "info": { "version": 1, "author": "codex" }
}
JSON

# 2) macOS .icns
MACSET="$OUT_DIR/macos/SmartTerminal.iconset"
mkdir -p "$MACSET"
# Required macOS iconset files
render_svg "$TILE_USE" 16  "$MACSET/icon_16x16.png"
render_svg "$TILE_USE" 32  "$MACSET/icon_16x16@2x.png"
render_svg "$TILE_USE" 32  "$MACSET/icon_32x32.png"
render_svg "$TILE_USE" 64  "$MACSET/icon_32x32@2x.png"
render_svg "$TILE_USE" 128 "$MACSET/icon_128x128.png"
render_svg "$TILE_USE" 256 "$MACSET/icon_128x128@2x.png"
render_svg "$TILE_USE" 256 "$MACSET/icon_256x256.png"
render_svg "$TILE_USE" 512 "$MACSET/icon_256x256@2x.png"
render_svg "$TILE_USE" 512 "$MACSET/icon_512x512.png"
render_svg "$TILE_USE" 1024 "$MACSET/icon_512x512@2x.png"
if command -v magick >/dev/null 2>&1; then
  magick mogrify -strip -alpha on -colorspace sRGB "$MACSET"/*.png
fi
if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$MACSET" -o "$OUT_DIR/macos/SmartTerminal.icns" || true
fi

# 3) Windows ICO
WIN_DIR="$OUT_DIR/windows"
mkdir -p "$WIN_DIR"
ICO_SIZES=(16 24 32 48 64 128 256)
TMP_LIST=()
for s in "${ICO_SIZES[@]}"; do
  png="$WIN_DIR/icon-${s}.png"
  render_svg "$TILE_USE" "$s" "$png"
  TMP_LIST+=("$png")
done
if command -v magick >/dev/null 2>&1; then
  magick "${TMP_LIST[@]}" "$WIN_DIR/SmartTerminal.ico"
elif command -v convert >/dev/null 2>&1; then
  convert "${TMP_LIST[@]}" "$WIN_DIR/SmartTerminal.ico"
fi

# 4) Web favicons + manifest
WEB_DIR="$OUT_DIR/web"
mkdir -p "$WEB_DIR"
render_svg "$TILE_USE" 16  "$WEB_DIR/favicon-16.png"
render_svg "$TILE_USE" 32  "$WEB_DIR/favicon-32.png"
render_svg "$TILE_USE" 48  "$WEB_DIR/favicon-48.png"
render_svg "$TILE_USE" 64  "$WEB_DIR/favicon-64.png"
render_svg "$TILE_USE" 96  "$WEB_DIR/favicon-96.png"
render_svg "$TILE_USE" 180 "$WEB_DIR/apple-touch-icon.png"
render_svg "$TILE_USE" 192 "$WEB_DIR/android-chrome-192.png"
render_svg "$TILE_USE" 512 "$WEB_DIR/android-chrome-512.png"
# favicon.ico from a few sizes
if command -v magick >/dev/null 2>&1; then
  magick "$WEB_DIR/favicon-16.png" "$WEB_DIR/favicon-32.png" "$WEB_DIR/favicon-48.png" "$WEB_DIR/favicon-64.png" "$WEB_DIR/favicon-96.png" "$WEB_DIR/favicon.ico"
fi

cat > "$WEB_DIR/site.webmanifest" << 'JSON'
{
  "name": "SmartTerminal",
  "short_name": "SmartTerminal",
  "icons": [
    {"src": "/android-chrome-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/android-chrome-512.png", "sizes": "512x512", "type": "image/png"}
  ],
  "theme_color": "#0A0B0D",
  "background_color": "#0A0B0D",
  "display": "standalone"
}
JSON

# 5) Android icons (legacy + adaptive foreground)
AND_DIR="$OUT_DIR/android"
for d in mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi; do
  mkdir -p "$AND_DIR/$d"
done
# Legacy launcher (square)
AND_LEGACY_LIST=(
  "mipmap-mdpi:48" "mipmap-hdpi:72" "mipmap-xhdpi:96" "mipmap-xxhdpi:144" "mipmap-xxxhdpi:192"
)
for entry in "${AND_LEGACY_LIST[@]}"; do
  IFS=":" read -r dir size <<< "$entry"
  render_svg "$TILE_USE" "$size" "$AND_DIR/$dir/ic_launcher.png"
done
# Adaptive foreground
AND_FG_LIST=(
  "mipmap-mdpi:108" "mipmap-hdpi:162" "mipmap-xhdpi:216" "mipmap-xxhdpi:324" "mipmap-xxxhdpi:432"
)
for entry in "${AND_FG_LIST[@]}"; do
  IFS=":" read -r dir size <<< "$entry"
  render_svg "$SYMBOL" "$size" "$AND_DIR/$dir/ic_launcher_foreground.png"
done
# Sample XMLs
mkdir -p "$AND_DIR/drawable"
cat > "$AND_DIR/drawable/ic_launcher.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
  <!-- Optional for Android 13+ monochrome: provide @drawable/ic_launcher_monochrome -->
</adaptive-icon>
XML
cat > "$AND_DIR/values-colors.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#0A0B0D</color>
</resources>
XML

# 6) Social images
SOC_DIR="$OUT_DIR/social"
mkdir -p "$SOC_DIR"
# 1200x630 and 1500x500 using tile, ImageMagick to pad/extent center if needed
if command -v magick >/dev/null 2>&1; then
  magick -background "#0A0B0D" "$TILE_USE" -resize 1024x1024 -gravity center -extent 1200x630 "$SOC_DIR/og-1200x630.png"
  magick -background "#0A0B0D" "$TILE_USE" -resize 1024x1024 -gravity center -extent 1500x500 "$SOC_DIR/twitter-1500x500.png"
else
  # Fallback: scaled squares (not perfectly sized for OG/Twitter)
  render_svg "$TILE_DARK" 1200 "$SOC_DIR/og-1200x630-fallback.png"
  render_svg "$TILE_DARK" 1500 "$SOC_DIR/twitter-1500x500-fallback.png"
fi

# 7) Basic PNGs for lockup/wordmark
LOCK_DIR="$OUT_DIR/brand"
mkdir -p "$LOCK_DIR"
for s in 512 1024 1600; do
  # width rendering: use magick to set width; rsvg only supports w/h; we render square height for simplicity
  if command -v magick >/dev/null 2>&1; then
    magick -background none "$ROOT_DIR/lockup-horizontal.svg" -resize ${s}x "$LOCK_DIR/lockup-${s}w.png"
    magick -background none "$ROOT_DIR/wordmark.svg" -resize ${s}x "$LOCK_DIR/wordmark-${s}w.png"
  else
    # approximate by height
    render_svg "$ROOT_DIR/lockup-horizontal.svg" "$s" "$LOCK_DIR/lockup-${s}.png"
    render_svg "$ROOT_DIR/wordmark.svg" "$s" "$LOCK_DIR/wordmark-${s}.png"
  fi

done

# Summary
printf "\nExport complete → %s\n" "$OUT_DIR"
