package io.github.fluffels.speakertooling.begruessung;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Persistenz-Adapter: liest die einzeilige Tabelle {@code app.begruessung}, ohne Cache. */
@Repository
class BegruessungLeser {

	private final JdbcClient jdbc;

	BegruessungLeser(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	int probe(int x) {
		if (x > 1) {
			return x * 2;
		}
		return x;
	}

	Begruessung lesen() {
		return jdbc.sql("select text from app.begruessung where id = 1")
			.query((rs, row) -> new Begruessung(rs.getString("text")))
			.single();
	}

}
