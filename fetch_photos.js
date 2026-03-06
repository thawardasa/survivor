const https = require('https');
const Database = require('better-sqlite3');

const db = new Database('./data/survivor.db');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SurvivorPool/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getWikipediaImageUrl(slug) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(slug)}&prop=pageimages&format=json&pithumbsize=400&pilicense=any`;
  try {
    const data = await fetchJson(url);
    const pages = data.query?.pages;
    if (pages) {
      const page = Object.values(pages)[0];
      return page?.thumbnail?.source || null;
    }
  } catch(e) {
    console.log(`Error fetching ${slug}: ${e.message}`);
  }
  return null;
}

async function main() {
  const slugMappings = [
    { id: 1,  name: 'Christian Hubicki', slug: 'Christian_Hubicki' },
    { id: 2,  name: 'Cirie Fields', slug: 'Cirie_Fields' },
    { id: 3,  name: 'Emily Flippen', slug: 'Emily_Flippen' },
    { id: 5,  name: 'Ozzy Lusth', slug: 'Oscar_Lusth' },
    { id: 6,  name: 'Rick Devens', slug: 'Rick_Devens' },
    { id: 8,  name: 'Jenna Lewis-Dougherty', slug: 'Jenna_Lewis_(Survivor)' },
    { id: 10, name: 'Chrissy Hofbeck', slug: 'Chrissy_Hofbeck' },
    { id: 11, name: 'Coach Wade', slug: 'Benjamin_Wade_(Survivor)' },
    { id: 12, name: 'Dee Valladares', slug: 'Dee_Valladares' },
    { id: 15, name: 'Mike White', slug: 'Mike_White_(filmmaker)' },
    { id: 17, name: 'Angelina Keeley', slug: 'Angelina_Keeley' },
    { id: 18, name: 'Aubry Bracco', slug: 'Aubry_Bracco' },
    { id: 19, name: 'Colby Donaldson', slug: 'Colby_Donaldson' },
    { id: 21, name: 'Q Burdette', slug: 'Quintavius_Burdette' },
    { id: 23, name: 'Stephenie LaGrossa Kendrick', slug: 'Stephenie_LaGrossa' },
    { id: 7,  name: 'Savannah Louie', slug: 'Savannah_Louie' },
    { id: 9,  name: 'Charlie Davis', slug: 'Charlie_Davis_(Survivor)' },
    { id: 13, name: 'Jonathan Young', slug: 'Jonathan_Young_(Survivor)' },
    { id: 14, name: 'Kamilla Karthigesu', slug: 'Kamilla_Karthigesu' },
    { id: 16, name: 'Tiffany Ervin', slug: 'Tiffany_Ervin' },
    { id: 20, name: 'Genevieve Mushaluk', slug: 'Genevieve_Mushaluk' },
    { id: 22, name: 'Rizo Velovic', slug: 'Rizo_Velovic' },
    { id: 24, name: 'Kyle Fraser', slug: 'Kyle_Fraser_(Survivor)' },
    { id: 4,  name: 'Joe Hunter', slug: 'Joe_Hunter_(Survivor)' },
  ];

  const updateStmt = db.prepare('UPDATE cast_members SET photo_url = ? WHERE id = ?');
  
  for (const item of slugMappings) {
    const url = await getWikipediaImageUrl(item.slug);
    if (url) {
      console.log(`✓ ${item.name}: ${url}`);
      updateStmt.run(url, item.id);
    } else {
      console.log(`✗ ${item.name}: not found`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('\nDone!');
}

main().catch(console.error);
