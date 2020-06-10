import fs from 'fs'
import stream from 'stream'
import path from 'path'

type Range = { from: number; to?: number; amount: number }

type HumanResult = {
  id: string
  age: number
  isSick: boolean
}

function getAge(birth: string) {
  const [, , yearOfBirth] = birth.split('/')
  if (!yearOfBirth) {
    throw new Error('invalid year in date')
  }

  return new Date().getFullYear() - Number(yearOfBirth)
}

function analyzeData(filePath: string): Promise<Range[]> {
  const ranges: Range[] = Array.from(Array(10).keys())
    .map<Range>(i => ({ from: i * 10, to: (i + 1) * 10 - 1, amount: 0 }))
    .concat([{ from: 90, amount: 0 }])

  const analyzeTransformStream = new stream.Transform({
    transform: function(chunk, _encoding, callback) {
      chunk
        .toString()
        .split('\n')
        .map((line: string) => line.trim().split('\t'))
        .filter((data: string[]) => data.length === 3 && data.every(Boolean))
        .map(([id, date, isSick]: [string, string, string]) => {
          return {
            id,
            age: getAge(date),
            isSick: isSick === 'Yes',
          }
        })
        .forEach((data: HumanResult) => {
          const { age } = data
          if (age >= 90) {
            ranges[ranges.length - 1].amount++
          } else if (age < 10) {
            ranges[0].amount++
          } else {
            const ageAsString = String(age)
            const index = Number(ageAsString.slice(0, ageAsString.length - 1))
            ranges[index].amount++
          }
        })
      callback()
    },
  })

  analyzeTransformStream.on('error', e => console.log('stav1'))

  return new Promise((res, rej) =>
    stream.pipeline(fs.createReadStream(filePath), analyzeTransformStream, error => (error ? rej(error) : res(ranges))),
  )
}

async function main() {
  const ranges = await analyzeData(path.join(__dirname, '../data1.txt'))
  console.log(ranges)
}
main()
