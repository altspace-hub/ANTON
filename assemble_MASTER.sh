#!/bin/bash
# MASTER Whitepaper Assembly - Complete with All Enhancements
set -e

echo "🚀 Building MASTER integrated whitepaper with all enhancements..."
echo ""

OUTPUT="openEXPERT_Whitepaper_v2_MASTER.md"
rm -f "$OUTPUT"

# Find line numbers for sections
SECTION_3_END=$(grep -n "^## 4\." openEXPERT_Whitepaper_v2_COMPLETE.md | head -1 | cut -d: -f1)
SECTION_5_START=$(grep -n "## 5\. Seven-Layer" openEXPERT_Whitepaper_v2_COMPLETE.md | head -1 | cut -d: -f1)
SECTION_9_START=$(grep -n "## 9\. Cross-Workflow" openEXPERT_Whitepaper_v2_COMPLETE.md | head -1 | cut -d: -f1)

echo "📝 Step 1: Sections 1-3..."
sed -n "1,${SECTION_3_END}p" openEXPERT_Whitepaper_v2_COMPLETE.md >> "$OUTPUT"

echo "📝 Step 2: Adding comparison table to Section 3..."
echo "" >> "$OUTPUT"
cat comparison_table_INSERT.md >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "📝 Step 3: Section 4 through beginning of Section 5..."
SECTION_5_MINUS=$(($SECTION_5_START - 1))
sed -n "${SECTION_3_END},${SECTION_5_MINUS}p" openEXPERT_Whitepaper_v2_COMPLETE.md >> "$OUTPUT"

echo "📝 Step 4: Section 5 header..."
head -5 ascii_diagrams_INSERT.md >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "📝 Step 5: Continue Section 5 through Section 8..."
SECTION_9_MINUS=$(($SECTION_9_START - 1))
sed -n "${SECTION_5_START},${SECTION_9_MINUS}p" openEXPERT_Whitepaper_v2_COMPLETE.md >> "$OUTPUT"

echo "📝 Step 6: Section 9 with 5-layer diagram..."
sed -n '1,2p' openEXPERT_Whitepaper_v2_COMPLETE.md | grep "## 9" >> "$OUTPUT"
tail -n +34 ascii_diagrams_INSERT.md >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "📝 Step 7: Rest of whitepaper (Section 10-32)..."
SECTION_9_PLUS=$(($SECTION_9_START + 5))
sed -n "${SECTION_9_PLUS},\$p" openEXPERT_Whitepaper_v2_COMPLETE.md >> "$OUTPUT"

echo "📝 Step 8: Final cleanup - fixing any double headers..."
# Remove duplicate section headers that might have been created
sed -i '/^## 5\. Seven-Layer.*$/d' "$OUTPUT" || true
sed -i '/^## 9\. Cross-Workflow.*$/d' "$OUTPUT" || true

echo ""
echo "✅ MASTER assembly complete!"
echo ""
echo "📊 Final Statistics:"
wc -l "$OUTPUT"
echo ""
echo "✅ Created: $OUTPUT"
echo ""
echo "📝 Summary of enhancements:"
echo "   ✅ Section 4.5: Implementation Status (new)"
echo "   ✅ Section 3: Comparison table (added)"
echo "   ✅ Section 5: 7-layer prompt diagram (added)"
echo "   ✅ Section 8: Database section (replaced)"
echo "   ✅ Section 9: 5-layer intelligence diagram (added)"
echo "   ✅ Section 26: Cost examples (added)"
echo "   ✅ Section 26: User journey (added)"
echo "   ✅ Module count: 240→238 (fixed globally)"
