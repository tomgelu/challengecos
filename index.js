const infobox = require('wiki-infobox')
const wtf = require('wtf_wikipedia')
const jsonfile = require('jsonfile')

let dbfile = "database.json"
let wordlistfile = "wordlist.json"

const exitLastTerm = true
let verbose = { error:false, verbose:false, dump:false}
process.argv.forEach(arg => {
    if (arg == '--error')
        verbose.error = true
    if (arg == '--verbose')
        verbose.verbose = true
    if (arg == '--dumpdb')
        verbose.dump = true
})

class Entity {
    constructor(name, data) {
        this.name = name
        this.data = data
        this.relations = []
    }
}

class Relation {
    constructor(actor, type, relationScore = 0) {
        this.actors = actor
        this.score = relationScore
        this.type = type
    }
}

const templateList = [ 
    'clergy',
    'muslim leader',
    'chef',
    'criminal',
    'pirate',
    'police officer',
    'spy',
    'theologian',
    'fbi ten most wanted',
    'war on terror detainee',
    'person',
    'command structure',
    'militant organization',
    'military unit',
    'military person',
    'national military',
    'war faction',
    'organization',
    'criminal organization'
]

let database = {}

var flattenObject = function(ob) {
	var toReturn = {};
	
	for (var i in ob) {
		if (!ob.hasOwnProperty(i)) continue;
		
		if ((typeof ob[i]) == 'object') {
			var flatObject = flattenObject(ob[i]);
			for (var x in flatObject) {
				if (!flatObject.hasOwnProperty(x)) continue;
				
				toReturn[i + '.' + x] = flatObject[x];
			}
		} else {
			toReturn[i] = ob[i];
		}
	}
	return toReturn;
};

async function GetData(word)
{
    return new Promise((res, rej) => {
        wtf.fetch(word, 'en').then(doc => {
            infobox(word, 'en', (err, data) => {
                if (err && verbose.error) {
                    console.error(err)
                }
                res({doc:doc, data:data})
            })
        }).catch(err => {
            rej(err)
        })
    }).catch(err => {
        rej(err)
    })
}

async function AddEntry(database, word, queue, i = 0)
{
    let result = GetData(word.page)
    result.then(fullData => {
        let doc = fullData.doc
        let data = fullData.data
        // Create new entity
        let info = doc.infobox()
        if (!info)
            return
        let type = info.type()
        if (!type)
            return
        // Exit if the "from" aka last term isnt found in last pages.
        if (word.from.length != 0 && exitLastTerm) {
            let count = 0
            word.from.forEach(w => {
                if (doc.text().search(w) == -1)
                    count++
                /*
                if (verbose.verbose)
                    console.log(`Last term (${w}) not found in this search (${word.page})`)
                */
            })
            if (count == word.from.length)
                return
        }
        if (!database[doc.title()] && templateList.includes(type))
        {
            console.log(`\x1b[32mCreating entity : ${doc.title()}\x1b[0m`)
            database[doc.title()] = new Entity(word, {}) // {type:type, data:data})
            if (word.from.length != 0)
            {
                if (word.relation)
                    database[doc.title()].relations.push(new Relation([...word.from].pop(), word.relation))
                else
                    database[doc.title()].relations.push(new Relation([...word.from].pop(), undefined))
            }
        }
        // find related links in infobox and their relations
        word.from.push(doc.title())
        doc.infobox().links().forEach((link, key) => {
            let relation = undefined
            let flatten = flattenObject(data)
            Object.keys(flatten).forEach(function(objectKey, index) {
                var value = flatten[objectKey];
                if (value == link.page)
                    relation = objectKey
            });
            if (relation)
                relation = relation.split('.')[0]
            queue.push({page:link.page, recursion:i + 1, from:word.from, relation:relation, recursionCount:word.recursionCount})
        })
    }).catch(err => {
        return err
    })

    return await Promise.all([result]);
}

async function FillDatabase(database, wordList, maxRecursion)
{
    let explored = {}
    let i = 0
    let queue = []
    wordList.forEach(word => {
        queue.push({page:word, recursion:0, from:[], relation: undefined, recursionCount: 0})
    })
    console.log("Initial queue status:")
    console.log(queue)
    while (queue.length != 0)
    {
        let search = queue.shift()
        if (!explored[search.page])
        {
            try
            {
                if (search.recursion <= maxRecursion)
                {
                    if (verbose.verbose)
                        console.log(`Searching for : ${search.page}`)
                    let result = await AddEntry(database, search, queue, search.recursion)
                    console.debug(`AddEntry : Promise resolved with result ${result}`)
                    explored[search.page] = true
                }
            }
            catch (err)
            {
                console.error(`AddEntry : Promise rejected with error : ${err}`)
            }
            if (verbose.dump)
            {
                console.log('Database log:')
                console.log(database)
            }
        }
    }
    if (verbose.dump)
    {
        console.log("Final database log :")
        console.log(database)
    }
}

let wordList
jsonfile.readFile(wordlistfile).then(list => {
    // get wordlist
    wordList = list
    // Read file
    jsonfile.readFile(dbfile).then(data => {
        // Get old data from file
        database = data
        // start scraping from wordList
        FillDatabase(database, wordList, 3).then(() => {
            Object.keys(database).forEach(function(objectKey, index) {
                database[objectKey].name = objectKey
            });
            jsonfile.writeFile(dbfile, database)
        })
    })
})


