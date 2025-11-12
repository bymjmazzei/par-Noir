# Feed Niches Standard
## par Noir - Initial 20 Niche Categories

### Overview

The par Noir feed system allows creators to curate content into specialized niches. These 20 initial categories cover the most popular social media niches that people build lifestyles around. All other content can be categorized as a subset of one of these niches.

### Initial Feed Niches

1. **Beauty & Fashion**
   - Makeup tutorials, fashion trends, skincare, style inspiration
   - Subsets: Makeup, Streetwear, Sustainable Fashion, Vintage, etc.

2. **Sports & Fitness**
   - Athletic performance, workout routines, sports highlights, nutrition
   - Subsets: Running, Weightlifting, Yoga, Basketball, Soccer, etc.

3. **TV, Film & Entertainment**
   - Movie reviews, TV show discussions, celebrity news, trailers
   - Subsets: Horror Films, Anime, Reality TV, Documentaries, etc.

4. **Music & Performing Arts**
   - Music production, concerts, dance, theater, album reviews
   - Subsets: Hip-Hop, Electronic, Classical, Indie, etc.

5. **Gaming & Esports**
   - Game reviews, esports tournaments, streaming, game development
   - Subsets: FPS, MOBA, Indie Games, Retro Gaming, etc.

6. **Technology & Gadgets**
   - Tech reviews, gadget unboxings, software tutorials, AI/ML
   - Subsets: Smartphones, Laptops, Smart Home, Crypto Tech, etc.

7. **Home & Interior Design**
   - Home decor, DIY projects, renovation, organization, architecture
   - Subsets: Minimalist Design, Vintage Decor, Tiny Homes, etc.

8. **Food & Culinary**
   - Recipes, restaurant reviews, cooking tutorials, food photography
   - Subsets: Vegan, Baking, BBQ, Fine Dining, Street Food, etc.

9. **Travel & Adventure**
   - Travel guides, destination reviews, adventure sports, photography
   - Subsets: Backpacking, Luxury Travel, Road Trips, etc.

10. **Wellness & Mental Health**
    - Meditation, therapy, self-care, mindfulness, holistic health
    - Subsets: Yoga, Therapy, Nutrition, Sleep, etc.

11. **Business & Entrepreneurship**
    - Startup advice, business strategies, marketing, finance
    - Subsets: E-commerce, SaaS, Freelancing, Investing, etc.

12. **Science & Education**
    - Educational content, scientific discoveries, tutorials, research
    - Subsets: Physics, Biology, History, Math, etc.

13. **Art & Design**
    - Digital art, traditional art, graphic design, illustration
    - Subsets: Digital Art, Watercolor, Typography, etc.

14. **DIY & Maker Culture**
    - Crafts, woodworking, electronics, 3D printing, repairs
    - Subsets: Woodworking, Electronics, Sewing, etc.

15. **Parenting & Family Life**
    - Parenting advice, family activities, child development
    - Subsets: New Parents, Homeschooling, etc.

16. **Eco & Sustainability**
    - Environmentalism, sustainable living, climate action, zero waste
    - Subsets: Zero Waste, Renewable Energy, etc.

17. **Finance & Investing**
    - Personal finance, investing strategies, crypto, real estate
    - Subsets: Crypto, Real Estate, Stocks, etc.

18. **Motors & Automotive**
    - Car reviews, modifications, racing, motorcycles, restoration
    - Subsets: Classic Cars, Motorcycles, Racing, etc.

19. **Humor & Meme Culture**
    - Memes, comedy sketches, parodies, internet humor
    - Subsets: Memes, Stand-up, Sketch Comedy, etc.

20. **Adults Only (18+)**
    - Umbrella category for all 18+ restricted content
    - Requires age verification
    - Subsets: Various adult-oriented niches

### Feed Architecture

- **Public Index**: All content (filtered by viewer's rating preferences)
- **Curated Feed Indexes**: Subsets of public index with additional curation rules
- **Third-Party Index**: Content syndicated to external platforms via APIs

### Implementation

Feeds are identified by:
- `feedId`: Unique identifier (e.g., "beauty-fashion", "sports-fitness")
- `feedName`: Human-readable name
- `feedCategory`: One of the 20 niches above
- `feedDescription`: Optional description
- `feedRatingRange`: Accepted rating range (e.g., ["GA", "FF", "T13+"])

