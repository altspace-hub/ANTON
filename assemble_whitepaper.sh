#!/bin/bash
# Whitepaper Integration Script
# Assembles complete integrated whitepaper with all corrections

set -e

echo "🚀 Assembling integrated openEXPERT Whitepaper..."

# Output file
OUTPUT="openEXPERT_Whitepaper_v2_FINAL.md"

# Start fresh
rm -f "$OUTPUT"

echo "📝 Part 1: Header through Section 4 (lines 1-653)..."
sed -n '1,653p' openEXPERT_Whitepaper_v2_INTEGRATED.md >> "$OUTPUT"

echo "📝 Part 2: Inserting Section 4.5 (Implementation Status)..."
cat whitepaper_section_4.5_NEW.md >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "📝 Part 3: PART 2 header through Section 7 (lines 654-1053)..."
sed -n '654,1053p' openEXPERT_Whitepaper_v2_INTEGRATED.md >> "$OUTPUT"

echo "📝 Part 4: Replacing Section 8 with corrected version..."
cat whitepaper_section_8_CORRECTED.md >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "📝 Part 5: Section 9 through end (lines 1160-end)..."
sed -n '1160,$p' openEXPERT_Whitepaper_v2_INTEGRATED.md >> "$OUTPUT"

echo "📝 Part 6: Fixing module count (240→238) globally..."
sed -i 's/240 modules/238 modules/g' "$OUTPUT"
sed -i 's/240 total modules/238 total modules/g' "$OUTPUT"

echo "✅ Assembly complete!"
echo ""
echo "📊 Statistics:"
wc -l "$OUTPUT"
echo ""
echo "✅ Created: $OUTPUT"
