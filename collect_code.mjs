import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Расширения файлов для сбора
const EXTENSIONS = ['.ts', '.tsx', '.scss', '.css', '.html'];

// Папки для игнорирования
const IGNORE_DIRS = ['node_modules', 'dist', '.git', 'build', 'coverage'];

// Выходной файл
const OUTPUT_FILE = 'collected_code.txt';

// Счетчики
let filesProcessed = 0;
let totalFilesFound = 0;

/**
 * Рекурсивный обход директории
 */
function walkDirectory(dir, callback) {
    try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                // Проверяем, нужно ли игнорировать папку
                if (!IGNORE_DIRS.includes(item)) {
                    walkDirectory(fullPath, callback);
                }
            } else if (stat.isFile()) {
                const ext = path.extname(item).toLowerCase();
                if (EXTENSIONS.includes(ext)) {
                    totalFilesFound++;
                    callback(fullPath);
                }
            }
        }
    } catch (error) {
        console.error(`Ошибка при чтении директории ${dir}:`, error.message);
    }
}

/**
 * Чтение содержимого файла
 */
function readFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`  Ошибка чтения файла ${filePath}:`, error.message);
        return `ОШИБКА ЧТЕНИЯ: ${error.message}`;
    }
}

/**
 * Запись файла с содержимым
 */
function writeCollectedFiles() {
    const outputStream = fs.createWriteStream(OUTPUT_FILE);
    
    console.log(`\n🔍 Поиск файлов с расширениями: ${EXTENSIONS.join(', ')}`);
    console.log(`🚫 Игнорируем папки: ${IGNORE_DIRS.join(', ')}`);
    console.log(`📁 Начинаем обход директорий...\n`);
    
    let isFirstFile = true;
    
    walkDirectory('.', (filePath) => {
        // Показываем прогресс в консоли
        process.stdout.write(`\r📄 Обработка файла ${filesProcessed + 1}/${totalFilesFound}: ${path.basename(filePath)}`);
        
        const content = readFileContent(filePath);
        const relativePath = path.relative('.', filePath);
        
        if (!isFirstFile) {
            outputStream.write('\n\n');
        }
        isFirstFile = false;
        
        outputStream.write(`// ${relativePath}\n`);
        outputStream.write(content);
        
        filesProcessed++;
    });
    
    outputStream.end(() => {
        console.log(`\n\n✅ Готово! Обработано файлов: ${filesProcessed}`);
        console.log(`📝 Результат сохранен в: ${OUTPUT_FILE}`);
        console.log(`📊 Общий размер файла: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
    });
}

/**
 * Очистка старого файла и запуск
 */
function start() {
    if (fs.existsSync(OUTPUT_FILE)) {
        fs.unlinkSync(OUTPUT_FILE);
    }
    
    console.log('🚀 Запуск сбора кода...\n');
    writeCollectedFiles();
}

// Запускаем скрипт
start();