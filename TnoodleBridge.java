import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Random;

import org.worldcubeassociation.tnoodle.scrambles.PuzzleRegistry;

public class TnoodleBridge {

    public static void main(String[] args) throws Exception {
        PrintStream out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, "UTF-8");
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        out.println("READY");
        out.flush();
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty()) {
                continue;
            }
            String[] parts = line.split("\\t", -1);
            try {
                if (parts[0].equals("EXIT")) {
                    break;
                } else if (parts[0].equals("SCRAMBLE") && parts.length >= 2) {
                    int count = parts.length >= 3 ? Integer.parseInt(parts[2]) : 1;
                    if (count < 1) {
                        count = 1;
                    }
                    Object puzzle = scramblerFor(parts[1]);
                    Random rng = new Random();
                    Method gen = puzzle.getClass().getMethod("generateWcaScramble", Random.class);
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < count; i++) {
                        if (i > 0) {
                            sb.append('\t');
                        }
                        sb.append((String) gen.invoke(puzzle, rng));
                    }
                    out.println("OK\t" + sb);
                } else if (parts[0].equals("IMAGE") && parts.length >= 3) {
                    String scramble = new String(Base64.getDecoder().decode(parts[2]), StandardCharsets.UTF_8);
                    Object puzzle = scramblerFor(parts[1]);
                    String svg = drawScramble(puzzle, scramble);
                    out.println("OK\t" + Base64.getEncoder().encodeToString(svg.getBytes(StandardCharsets.UTF_8)));
                } else {
                    out.println("ERR\tbad command");
                }
            } catch (Exception e) {
                Throwable cause = e.getCause() != null ? e.getCause() : e;
                String msg = String.valueOf(cause)
                        .replace('\t', ' ').replace('\n', ' ').replace('\r', ' ');
                out.println("ERR\t" + msg);
            }
            out.flush();
        }
        out.flush();
    }

    private static Object scramblerFor(String puzzleId) throws Exception {
        String enumName = enumName(puzzleId);
        if (enumName == null) {
            throw new IllegalArgumentException("Unknown puzzle id '" + puzzleId + "'");
        }
        Object constant;
        try {
            Field field = PuzzleRegistry.class.getField(enumName);
            constant = field.get(null);
        } catch (NoSuchFieldException e) {
            throw new IllegalArgumentException("Puzzle '" + enumName + "' is not available in this TNoodle build");
        }
        return constant.getClass().getMethod("getScrambler").invoke(constant);
    }

    private static String drawScramble(Object puzzle, String scramble) throws Exception {
        for (Method m : puzzle.getClass().getMethods()) {
            if (!m.getName().equals("drawScramble") || m.getParameterCount() != 2) {
                continue;
            }
            if (m.getParameterTypes()[0] != String.class) {
                continue;
            }
            try {
                Object svg = m.invoke(puzzle, new Object[] { scramble, null });
                return String.valueOf(svg);
            } catch (IllegalArgumentException ignored) {
            }
        }
        throw new NoSuchMethodException("drawScramble(String, ...) not found on puzzle class "
                + puzzle.getClass().getName());
    }

    private static String enumName(String id) {
        switch (id) {
            case "222": return "TWO";
            case "333": return "THREE";
            case "444": return "FOUR";
            case "555": return "FIVE";
            case "666": return "SIX";
            case "777": return "SEVEN";
            case "333oh": return "THREE";
            case "clock": return "CLOCK";
            case "minx": return "MEGA";
            case "pyram": return "PYRA";
            case "skewb": return "SKEWB";
            case "sq1": return "SQ1";
            case "333bf": return "THREE_NI";
            case "444bf": return "FOUR_NI";
            case "555bf": return "FIVE_NI";
            case "333fm": return "THREE_FM";
            case "333mbf": return "THREE";
            default: return null;
        }
    }
}
