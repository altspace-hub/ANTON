#!/bin/bash
# Complete Whitepaper Assembly - All Enhancements
set -e

echo "🚀 Building COMPLETE integrated whitepaper..."

OUTPUT="openEXPERT_Whitepaper_v2_COMPLETE.md"
rm -f "$OUTPUT"

# Part 1: Everything through Section 26 start
echo "📝 Part 1: Sections 1-25..."
sed -n '1,6220p' openEXPERT_Whitepaper_v2_FINAL.md >> "$OUTPUT"

# Part 2: Insert cost examples into Section 26
echo "📝 Part 2: Adding cost examples to Section 26..."
echo "" >> "$OUTPUT"
cat whitepaper_cost_examples_INSERT.md >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Part 3: Insert user journey
echo "📝 Part 3: Adding user journey to Section 26..."
cat whitepaper_user_journey_INSERT.md >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Part 4: Rest of whitepaper (Section 27 onward)
echo "📝 Part 4: Sections 27-32..."
sed -n '6221,$p' openEXPERT_Whitepaper_v2_FINAL.md >> "$OUTPUT"

echo "✅ Complete assembly done!"
echo ""
wc -l "$OUTPUT"
echo "✅ Created: $OUTPUT"
