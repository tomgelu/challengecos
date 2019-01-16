const infobox = require('wiki-infobox')
const wtf = require('wtf_wikipedia')
const jsonfile = require('jsonfile')

const exitLastTerm = true
let ended = false
let options = { error:false, verbose:false, fullverbose:false, dump:false, data: false }
process.argv.forEach(arg => {
    if (arg == '--error')
        options.error = true
    if (arg == '--verbose')
        options.verbose = true
    if (arg == '--fullverbose') {
        options.verbose = true
        options.fullverbose = true
    }
    if (arg == '--dump')
        options.dump = true
    if (arg == '--data')
        options.data = true
})

class Entity {
    constructor(name, data) {
        this.name = name
        this.data = data
        this.relations = []
    }
    AddRelation(actor, type)
    {
        let potentialRel = this.relations.find(rel => {
            rel.actor == actor
        })
        if (potentialRel)
        {
            console.log(`Adding relation type between : \x1b[34m${this.name.page}\x1b[0m and \x1b[34m${actor}\x1b[0m`)
            potentialRel.score += 1
            if (type)
                potentialRel.types.push(type)
        }
        else
        {
            console.log(`Creating relation between : \x1b[34m${this.name.page}\x1b[0m and \x1b[34m${actor}\x1b[0m`)
            if (type)
                this.relations.push(new Relation(actor, [ type ]))
            else
                this.relations.push(new Relation(actor, []))
        }
    }
}

class Relation {
    constructor(actor, type, relationScore = 0) {
        this.actor = actor
        this.score = relationScore
        this.types = type
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
                if (err && options.error) {
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
        if (!doc)
            return
        let data = fullData.data
        if (!data)
            return
        // Create new entity
        let info = doc.infobox()
        if (!info)
            return
        let type = info.type()
        if (!type)
            return
        // STILL WORK TO DO HERE
        // Exit if the "from" aka last term isnt found in last pages.
        if (word.from.length != 0 && exitLastTerm) {
            let count = 0
            word.from.forEach(w => {
                if (doc.text().search(w) == -1)
                    count++
            })
            if (count == word.from.length)
                return
        }
        if (templateList.includes(type))
        {
            if (!database[doc.title()])
            {
                if (options.verbose)
                    console.log(`Creating entity : \x1b[32m${doc.title()}\x1b[0m`)
                if (options.data)
                    database[doc.title()] = new Entity(word, { type:type, data:data })
                else
                    database[doc.title()] = new Entity(word, {})
            }
            if (word.from.length != 0)
            {
                if (word.relation)
                {
                    let relationsAdded = []
                    if (database[[...word.from].pop()] && [...word.from].pop() != doc.title())
                    {
                        relationsAdded.push([...word.from].pop())
                        database[doc.title()].AddRelation([...word.from].pop(), word.relation)
                        database[[...word.from].pop()].AddRelation(doc.title(), undefined)
                    }      
                    if (database[[...word.from].slice(-3, -2)[0]] && [...word.from].slice(-3, -2)[0] != doc.title())
                    {
                        relationsAdded.push([...word.from].slice(-3, -2))
                        database[[...word.from].slice(-3, -2)[0]].AddRelation(doc.title(), undefined)
                        database[doc.title()].AddRelation([...word.from].slice(-3, -2)[0], undefined)
                    }               
                }   
                else
                {
                    let relationsAdded = []
                    if (database[[...word.from].pop()])
                    {
                        relationsAdded.push([...word.from].pop())
                        database[doc.title()].AddRelation([...word.from].pop(), undefined)
                        database[[...word.from].pop()].AddRelation(doc.title(), undefined)
                    }                        
                    if (database[[...word.from].slice(-3, -2)])
                    {
                        relationsAdded.push([...word.from].slice(-3, -2))
                        database[[...word.from].slice(-3, -2)].AddRelation(doc.title(), undefined)
                        database[doc.title()].AddRelation([...word.from].slice(-3, -2), undefined)
                    }
                }      
            }
        }
        // find related links in infobox and their relations
        word.from.push(doc.title())
        doc.infobox().links().forEach((link, key) => {
            let relation = undefined
            let flatten = flattenObject(data)
            Object.keys(flatten).forEach((objectKey, index) => {
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
    queue.forEach((word, index) => {
        console.log(`${index} : ${word.page}`)
    })
    while (queue.length != 0)
    {
        let search = queue.shift()
        if (options.fullverbose)
            console.log(`Queue length : ${queue.length}`)
        if (!explored[search.page] || (database[search.page] && explored[search.page] <= maxRecursion))
        {
            try
            {
                if (search.recursion <= maxRecursion)
                {
                    if (!explored[search.page])
                        explored[search.page] = 0
                    if (options.fullverbose)
                        console.log(`Searching for : ${search.page} for the ${explored[search.page] + 1}rd time`)
                    let result = await AddEntry(database, search, queue, search.recursion)
                    // console.debug(`AddEntry : Promise resolved with result ${result}`)
                    
                    explored[search.page] += 1
                }
            }
            catch (err)
            {
                console.error(`AddEntry : Promise rejected with error : ${err}`)
            }
            if (options.dump)
            {
                console.log('Database log:')
                console.log(database)
            }
        }
    }
    if (options.dump)
    {
        console.log("Final database log :")
        console.log(database)
    }
}

process.on('SIGINT', function() {
    process.exit(0);
});

process.on('SIGTERM', function() {
    process.exit(0);
});

process.on('exit', function() {
    if (!ended)
    {
        jsonfile.writeFileSync("db.json", database)
        process.stdout.write("Database saved in 'db.json'");
    }
});

let wordList
let dbfile
let recursion
jsonfile.readFile("config.json").then(config => {
    // get wordlist
    wordList = config.wordlist
    dbfile = config.dbfile
    recursion = config.recursion
    // Read file
    jsonfile.readFile(dbfile).then(data => {
        // Get old data from file
        database = data
        // start scraping from wordList
        FillDatabase(database, wordList, recursion).then(() => {
            // Clean "name" field
            ended = true
            Object.keys(database).forEach(function(objectKey, index) {
                database[objectKey].name = objectKey
            });
            jsonfile.writeFile(dbfile, database)
        }).catch(err => { return err })
    }).catch(err => { return err })
}).catch(err => { return err })


