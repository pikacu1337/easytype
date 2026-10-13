// Словари частотных слов. Без «ё», чтобы не спотыкаться о редкую клавишу.
const WORDS = {
  ru: (
    'и в не на я что он с как это по но они к у ты из мы за вы так же от сказать этот который ' +
    'мочь человек о один еще бы такой только себя свое какой когда уже для вот кто да говорить ' +
    'год знать мой до или если время рука нет самый ни стать большой даже другой наш свой ну под ' +
    'где дело есть сам раз чтобы два там чем глаз жизнь первый день тут потом очень хотеть ли при ' +
    'голова надо без видеть идти теперь тоже стоять друг дом сейчас можно после слово здесь думать ' +
    'место спросить через лицо тогда ведь каждый новый жить смотреть почему потому сторона просто ' +
    'нога сидеть понять иметь делать вдруг над взять никто сделать дверь перед нужный понимать ' +
    'казаться работа три ваш земля конец несколько час голос город последний пока хорошо давать ' +
    'вода более хотя всегда второй куда пойти стол ребенок увидеть сила отец женщина машина случай ' +
    'ночь сразу мир совсем остаться вид выйти дать работать любить старый почти ряд оказаться ' +
    'начало твой вопрос много снова ответить между подумать опять белый деньги значить про лишь ' +
    'минута жена правда страна свет ждать мать будто никогда дорога однако лежать именно окно ' +
    'найти писать комната часть вообще книга маленький улица решить далекий душа чуть вернуться ' +
    'утро некоторый считать сколько помнить вечер получить образ народ плечо хоть сегодня вместе ' +
    'взгляд ходить зачем русский бывать полный прийти палец история небо письмо море ветер песня ' +
    'быстро легко текст клавиша скорость точность музыка солнце дерево школа играть читать'
  ).split(' '),

  en: (
    'the be of and a to in he have it that for they with as not on she at by this we you do but ' +
    'from or which one would all will there say who make when can more if no man out other so ' +
    'what time up go about than into could state only new year some take come these know see use ' +
    'get like then first any work now may such give over think most even find day also after way ' +
    'many must look before great back through long where much should well people down own just ' +
    'because good each those feel seem how high too place little world very still nation hand old ' +
    'life tell write become here show house both between need mean call develop under last right ' +
    'move thing general school never same another begin while number part turn real leave might ' +
    'want point form off child few small since against ask late home interest large person end ' +
    'open public follow during present without again hold around possible head consider word ' +
    'program problem however lead system set order eye plan run keep face fact group play stand ' +
    'increase early course change help line quick light sound type speed letter music water'
  ).split(' '),
};
