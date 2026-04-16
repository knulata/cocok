type LoveTypeKey =
  | 'deep-connector'
  | 'passionate-explorer'
  | 'steady-anchor'
  | 'free-spirit'
  | 'growth-partner'
  | 'romantic-dreamer';

const MESSAGES: Record<LoveTypeKey, string[]> = {
  'deep-connector': [
    'Minggu ini coba lebih jujur sama perasaanmu. Kamu sering nahan ekspresi demi jaga perasaan orang — tapi orang yang tepat justru butuh tahu apa yang kamu rasakan.',
    'Percakapan mendalam bakal muncul di minggu ini. Jangan takut buat tanya pertanyaan yang dalam — itu cara kamu paling nyaman connect.',
    'Ada risiko overthinking minggu ini. Kalau ada yang bikin kamu cemas, langsung tanya dan klarifikasi — jangan diputer-puter sendiri di kepala.',
    'Self-care week: kamu sering kasih empati ke orang lain tapi lupa kasih ke diri sendiri. Minggu ini, isi ulang dulu.',
    'Momen tulus akan datang dari orang yang ga terduga. Perhatikan siapa yang beneran mendengarkan kamu.',
    'Minggu ini cocok untuk nulis — journal, WA panjang ke temen, atau puisi. Emosimu lagi lancar dan butuh outlet.',
  ],
  'passionate-explorer': [
    'Energimu minggu ini bakal magnetik. Tapi hati-hati — chemistry cepat ga selalu berarti koneksi dalam. Beri waktu orang baru untuk berkembang.',
    'Kesempatan petualangan di minggu ini. Katakan YA ke ajakan tak terduga — tapi pastikan pasanganmu sevisi, bukan cuma jadi penonton.',
    'Jangan tergoda drama buat dapat perhatian. Kamu sudah menarik apa adanya.',
    'Minggu ini cocok untuk reframe hubungan sebagai marathon, bukan sprint. Passion yang bertahan adalah yang ada di hari-hari biasa.',
    'Ada orang yang tenang tapi dalam di sekitarmu minggu ini. Jangan langsung skip mereka — ketenangannya bisa jadi pasangan sejati kamu.',
    'Minggu ini: reality check. Apa yang kamu cari — excitement atau connection? Jawaban jujur bakal mengubah banyak hal.',
  ],
  'steady-anchor': [
    'Seseorang yang udah lama memperhatikan kamu akhirnya bakal berani speak up minggu ini. Buka diri buat dengerin.',
    'Kestabilanmu adalah kekuatan — bukan "ga romantis". Jangan pernah minta maaf soal itu.',
    'Minggu ini coba lakuin satu hal spontan yang ga kamu rencanakan. Hubungan yang sehat butuh sedikit surprise.',
    'Orang yang cocok sama kamu adalah yang merasa "pulang" saat deket sama kamu. Jangan cari fireworks — cari rumah.',
    'Komitmen kecil minggu ini bakal bangun kepercayaan besar. Konsisten > intens.',
    'Beri diri izin untuk vulnerable. Steadiness bukan berarti ga bisa nangis. Yang tepat bakal menerima sisi itu juga.',
  ],
  'free-spirit': [
    'Kebebasanmu minggu ini justru jadi daya tarik. Tapi pastikan orang yang deket tau kamu peduli — jangan sampai mereka salah sangka kamu dingin.',
    'Seseorang yang sama santainya sama kamu akan muncul. Tanda kecocokan: ga ada yang terasa "kerjain" waktu bareng dia.',
    'Hati-hati minggu ini: kebebasan yang jadi pelarian itu beda sama kebebasan yang sehat. Tanya ke diri sendiri — kamu lagi explore atau lagi kabur?',
    'Minggu ini cocok buat solo date. Kafe baru, jalan sendiri, refleksi. Kamu paling paham diri kamu pas sendirian.',
    'Orang yang memberikan kamu ruang TANPA kamu minta — itulah yang cocok. Simpan mereka baik-baik.',
    'Low-stakes week. Jangan buat keputusan besar soal hubungan. Nikmati aja dulu apa yang ada.',
  ],
  'growth-partner': [
    'Minggu ini: cari seseorang yang pertanyaannya bikin kamu mikir lebih dalam tentang diri kamu. Itu tanda kecocokan untuk pola cintamu.',
    'Proyek bareng pasangan (atau calon pasangan) bakal bring out the best di hubungan. Masak bareng, olahraga bareng, belajar bareng — apapun.',
    'Hati-hati mix up antara "pacaran buat tumbuh" sama "pacaran buat memperbaiki orang". Yang pertama sehat, yang kedua melelahkan.',
    'Seseorang yang udah pada level mental yang sama sama kamu akan mendekat minggu ini. Kamu bakal tahu — conversations feel effortless.',
    'Minggu ini refleksi: apakah kamu udah jadi versi yang ingin kamu kasih ke pasangan ideal? Jujur sama diri sendiri.',
    'Growth gak harus serius terus. Minggu ini izinkan diri untuk playful — main yang santai juga bagian dari tumbuh bareng.',
  ],
  'romantic-dreamer': [
    'Jaga ekspektasi minggu ini. Kamu cenderung bangun narasi di kepala — coba biarkan orang menunjukkan siapa mereka sebenarnya dulu.',
    'Gesture kecil yang tulus lebih berarti dari grand gesture minggu ini. Perhatikan.',
    'Kamu layak dicintai sama pasiennya sama pola cintamu. Jangan settle untuk yang ga mampu.',
    'Minggu ini: tulis surat cinta untuk diri sendiri. Apa yang kamu inginkan dari pasangan? Itu yang harus kamu kasih ke diri kamu dulu.',
    'Hati-hati sama ide "the one" yang bikin kamu abaikan red flags. Cinta sejati tetap butuh mata jernih.',
    'Momen magis bakal muncul di tempat biasa minggu ini. Hubungan paling indah tumbuh dari momen sederhana yang kamu sadar betul.',
  ],
};

export function getWeeklyMessage(loveTypeKey: string): string | null {
  const list = MESSAGES[loveTypeKey as LoveTypeKey];
  if (!list) return null;
  const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % list.length;
  return list[weekIndex];
}

export function formatHoroscopeMessage(name: string, loveType: string, emoji: string, body: string): string {
  return [
    `🌙 *Ramalan Cinta Mingguan — ${name}*`,
    '',
    `Pola cintamu: *${loveType}* ${emoji}`,
    '',
    body,
    '',
    '─────────',
    '_Cocok.app — Cari yang Beneran Cocok_',
    'Balas *HAPUS* untuk berhenti menerima pesan ini.',
  ].join('\n');
}
