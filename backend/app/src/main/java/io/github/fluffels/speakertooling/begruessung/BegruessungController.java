package io.github.fluffels.speakertooling.begruessung;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** REST-Eingangsadapter für {@code GET /api/begruessung}. */
@RestController
class BegruessungController {

	private final BegruessungLeser leser;

	BegruessungController(BegruessungLeser leser) {
		this.leser = leser;
	}

	@GetMapping("/api/begruessung")
	Begruessung begruessung() {
		return leser.lesen();
	}

}
