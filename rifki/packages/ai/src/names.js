// Bot isimleri: 100 isim (50 kadın, 50 erkek). Lakap/unvan yok.

export const FEMALE_NAMES = [
  'Ayşe', 'Fatma', 'Emine', 'Hatice', 'Zeynep', 'Elif', 'Merve', 'Büşra', 'Esra', 'Seda',
  'Derya', 'Gül', 'Selin', 'Sevgi', 'Nermin', 'Tülin', 'Hülya', 'Ebru', 'Pınar', 'Burcu',
  'Dilek', 'Filiz', 'Gamze', 'Gizem', 'İpek', 'Jale', 'Kader', 'Leyla', 'Melek', 'Nazlı',
  'Özge', 'Rabia', 'Sibel', 'Tuğba', 'Ülkü', 'Yasemin', 'Zehra', 'Aylin', 'Banu', 'Canan',
  'Defne', 'Eda', 'Figen', 'Gonca', 'Handan', 'Işıl', 'Kübra', 'Lale', 'Meltem', 'Neslihan',
];

export const MALE_NAMES = [
  'Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Ömer', 'Yusuf', 'Murat',
  'Emre', 'Burak', 'Serkan', 'Cem', 'Kemal', 'Orhan', 'Tolga', 'Volkan', 'Barış', 'Can',
  'Deniz', 'Erdem', 'Faruk', 'Gökhan', 'Haluk', 'İlker', 'Kaan', 'Levent', 'Metin', 'Necati',
  'Oğuz', 'Polat', 'Rıza', 'Selim', 'Tarık', 'Uğur', 'Vedat', 'Yavuz', 'Zafer', 'Alper',
  'Berkay', 'Coşkun', 'Doğan', 'Engin', 'Fikret', 'Güven', 'Hakan', 'İsmail', 'Koray', 'Taner',
];

export const NAMES = [
  ...FEMALE_NAMES.map((name) => ({ name, gender: 'F' })),
  ...MALE_NAMES.map((name) => ({ name, gender: 'M' })),
];
